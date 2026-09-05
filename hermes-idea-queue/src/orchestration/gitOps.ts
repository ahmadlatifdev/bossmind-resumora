import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { loadConfig } from '../config.js';

const execFileAsync = promisify(execFile);

async function git(args: string[], cwd: string): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync('git', args, {
    cwd,
    maxBuffer: 10 * 1024 * 1024,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: loadConfig().GIT_AUTHOR_NAME,
      GIT_AUTHOR_EMAIL: loadConfig().GIT_AUTHOR_EMAIL,
      GIT_COMMITTER_NAME: loadConfig().GIT_AUTHOR_NAME,
      GIT_COMMITTER_EMAIL: loadConfig().GIT_AUTHOR_EMAIL,
    },
  });
}

export async function createFeatureBranch(ideaId: string): Promise<string> {
  const cfg = loadConfig();
  const branch = `${cfg.BRANCH_PREFIX}${ideaId.toLowerCase()}`;
  const cwd = cfg.REPO_ROOT;
  await git(['fetch', 'origin'], cwd).catch(() => undefined);
  await git(['checkout', 'main'], cwd).catch(async () => {
    await git(['checkout', 'master'], cwd);
  });
  await git(['pull', '--ff-only'], cwd).catch(() => undefined);
  await git(['checkout', '-B', branch], cwd);
  return branch;
}

export async function runLocalChecks(): Promise<{
  lintOk: boolean;
  testsOk: boolean;
  log: string;
}> {
  const cwd = loadConfig().REPO_ROOT;
  const logs: string[] = [];
  let lintOk = true;
  let testsOk = true;

  try {
    const lint = await execFileAsync(
      process.platform === 'win32' ? 'npm.cmd' : 'npm',
      ['run', 'lint', '--', '--max-warnings=0'],
      { cwd, maxBuffer: 10 * 1024 * 1024 }
    );
    logs.push(lint.stdout, lint.stderr);
  } catch (err) {
    lintOk = false;
    logs.push(err instanceof Error ? err.message : String(err));
  }

  try {
    const test = await execFileAsync(
      process.platform === 'win32' ? 'npm.cmd' : 'npm',
      ['run', 'test:billing', '--if-present'],
      { cwd, maxBuffer: 10 * 1024 * 1024 }
    );
    logs.push(test.stdout, test.stderr);
  } catch (err) {
    // billing tests may be heavy/env-bound — treat missing script as skip
    const msg = err instanceof Error ? err.message : String(err);
    if (/Missing script/i.test(msg)) {
      testsOk = true;
      logs.push('tests skipped (script missing)');
    } else {
      testsOk = false;
      logs.push(msg);
    }
  }

  return { lintOk, testsOk, log: logs.join('\n').slice(0, 20_000) };
}

export async function atomicCommitAndPush(branch: string, message: string): Promise<string | null> {
  const cfg = loadConfig();
  const cwd = cfg.REPO_ROOT;
  await git(['add', '-A'], cwd);
  const status = await git(['status', '--porcelain'], cwd);
  if (!status.stdout.trim()) {
    console.warn('[git] nothing to commit');
    return null;
  }
  await git(['commit', '-m', message], cwd);
  const sha = (await git(['rev-parse', 'HEAD'], cwd)).stdout.trim();

  if (cfg.PROTECTED_BASE_BRANCHES.includes(branch)) {
    throw new Error(`Refusing to push protected branch ${branch}`);
  }

  await git(['push', '-u', 'origin', `HEAD:refs/heads/${branch}`], cwd);
  return sha;
}

export async function openPullRequest(
  branch: string,
  title: string,
  body: string
): Promise<string | null> {
  const cfg = loadConfig();
  if (!cfg.GITHUB_TOKEN) {
    console.warn('[git] GITHUB_TOKEN missing — skip PR create');
    return null;
  }
  const [owner, repo] = cfg.GITHUB_REPO.split('/');
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({
      title,
      head: branch,
      base: 'main',
      body,
      draft: false,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    console.warn('[git] PR create failed', res.status, text.slice(0, 400));
    return null;
  }
  const data = (await res.json()) as { html_url?: string };
  return data.html_url || null;
}
