import { loadConfig } from '../config.js';
import { compressContext } from '../rag/compressor.js';
import { acquireFileLocks, releaseFileLocks } from './fileLock.js';
import { runCursorAgent } from './cursorAgent.js';
import {
  atomicCommitAndPush,
  createFeatureBranch,
  openPullRequest,
  runLocalChecks,
} from './gitOps.js';
import { buildIdeaGraph } from './graph.js';
export async function runIdeaGraph(opts) {
  const cfg = loadConfig();
  const idea = { ...opts.idea };
  const owner = `idea:${idea.id}:a${opts.attempt}`;
  const graph = buildIdeaGraph({
    compress: async () => {
      const contextPack = await compressContext(idea);
      idea.contextDigest = contextPack.slice(0, 500);
      return { contextPack, node: 'compress' };
    },
    lock: async (state) => {
      const files = idea.requestedFiles.length
        ? idea.requestedFiles
        : ['src/pages/MasterAdminPage.tsx'];
      const lock = await acquireFileLocks(files, owner);
      if (!lock.ok) {
        return { error: `File lock blocked: ${lock.blockedBy}`, node: 'fail' };
      }
      idea.lockedFiles = lock.locked;
      return { lockedFiles: lock.locked, node: 'lock' };
    },
    branch: async () => {
      try {
        if (cfg.CURSOR_DRY_RUN) {
          const branch = `${cfg.BRANCH_PREFIX}${idea.id.toLowerCase()}`;
          idea.branchName = branch;
          return { branchName: branch, node: 'branch' };
        }
        const branch = await createFeatureBranch(idea.id);
        idea.branchName = branch;
        return { branchName: branch, node: 'branch' };
      } catch (err) {
        return { error: err instanceof Error ? err.message : String(err), node: 'fail' };
      }
    },
    agent: async (state) => {
      const result = await runCursorAgent({
        idea,
        contextPack: state.contextPack,
        failureLog: opts.failureLog,
      });
      if (result.status === 'error') {
        return { error: result.summary, node: 'agent' };
      }
      return { node: 'agent', error: null };
    },
    verify: async () => {
      if (cfg.CURSOR_DRY_RUN) {
        return { lintOk: true, testsOk: true, verifyLog: 'dry-run skip checks', node: 'verify' };
      }
      const checks = await runLocalChecks();
      if (!checks.lintOk || !checks.testsOk) {
        idea.lastError = checks.log;
        idea.status = opts.attempt + 1 >= cfg.MAX_QA_RETRIES ? 'failed' : 'qa_failed';
        idea.qaAttempts = opts.attempt + 1;
        return {
          lintOk: checks.lintOk,
          testsOk: checks.testsOk,
          verifyLog: checks.log,
          error: 'verify failed',
          node: 'verify',
        };
      }
      return {
        lintOk: true,
        testsOk: true,
        verifyLog: checks.log,
        node: 'verify',
      };
    },
    commit: async (state) => {
      if (cfg.CURSOR_DRY_RUN) {
        return { commitSha: 'dry-run', node: 'commit' };
      }
      try {
        const sha = await atomicCommitAndPush(
          state.branchName,
          `feat(auto): ${idea.id} ${idea.title}\n\nTriggered by Hermes idea-queue (${opts.trigger}).`
        );
        return { commitSha: sha, node: 'commit' };
      } catch (err) {
        return { error: err instanceof Error ? err.message : String(err), node: 'fail' };
      }
    },
    pr: async (state) => {
      if (cfg.CURSOR_DRY_RUN) {
        idea.status = 'pr_ready';
        idea.prUrl = `https://github.com/${cfg.GITHUB_REPO}/compare/${state.branchName}?expand=1`;
        return { prUrl: idea.prUrl, node: 'pr' };
      }
      const url = await openPullRequest(
        state.branchName,
        `[Auto] ${idea.id}: ${idea.title}`,
        [
          '## Summary',
          idea.description,
          '',
          '## Automation',
          `- Idea ID: ${idea.id}`,
          `- Attempt: ${opts.attempt}`,
          `- Trigger: ${opts.trigger}`,
          `- Priority: ${idea.priorityScore}`,
          '',
          '## Safety',
          `- Risk flags: ${idea.riskFlags.join(', ') || 'none'}`,
          '- Do **not** auto-merge. Human review required before production.',
        ].join('\n')
      );
      idea.prUrl = url || undefined;
      idea.status = url ? 'pr_ready' : 'failed';
      return { prUrl: url, node: 'pr' };
    },
    unlock: async (state) => {
      await releaseFileLocks(
        state.lockedFiles.length ? state.lockedFiles : idea.lockedFiles,
        owner
      );
      return { done: true, node: 'unlock' };
    },
    fail: async (state) => {
      idea.status = idea.status === 'qa_failed' ? idea.status : 'failed';
      idea.lastError = state.error || idea.lastError;
      return { node: 'fail', done: false };
    },
  });
  const initial = {
    node: 'compress',
    contextPack: '',
    lockedFiles: [],
    branchName: '',
    lintOk: false,
    testsOk: false,
    verifyLog: '',
    commitSha: null,
    prUrl: null,
    error: null,
    done: false,
  };
  const state = await graph.run(initial);
  if (state.prUrl && idea.status !== 'failed' && idea.status !== 'qa_failed') {
    idea.status = 'pr_ready';
  }
  return { idea, state };
}
