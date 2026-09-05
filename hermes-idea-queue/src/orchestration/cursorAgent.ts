import { loadConfig } from '../config.js';
import type { TriagedIdea } from '../types.js';

export type CursorRunResult = {
  status: 'ok' | 'error' | 'dry_run';
  summary: string;
  agentId?: string;
};

/**
 * Cursor Agent layer — uses @cursor/sdk when installed + keyed.
 * Falls back to deterministic dry-run so Docker/CI remain runnable.
 */
export async function runCursorAgent(opts: {
  idea: TriagedIdea;
  contextPack: string;
  failureLog?: string;
}): Promise<CursorRunResult> {
  const cfg = loadConfig();
  const prompt = [
    `Implement idea ${opts.idea.id}: ${opts.idea.title}`,
    opts.idea.description,
    '',
    'Follow BossMind/Resumora guardrails: incremental patch only, no secrets, no production deploy, no locked chrome edits.',
    'Create/update code, add/adjust unit tests when practical, keep the change atomic.',
    opts.failureLog ? `\nPrevious CI failure log to fix:\n${opts.failureLog.slice(0, 6000)}` : '',
    '',
    'Compressed context:',
    opts.contextPack.slice(0, 10_000),
  ].join('\n');

  if (cfg.CURSOR_DRY_RUN || !cfg.CURSOR_API_KEY) {
    return {
      status: 'dry_run',
      summary: `[dry-run] Would run Cursor agent for ${opts.idea.id} with ${prompt.length} char prompt`,
    };
  }

  try {
    const mod = (await import('@cursor/sdk')) as {
      Agent: {
        prompt: (
          p: string,
          o: { apiKey: string; model: { id: string }; local: { cwd: string } }
        ) => Promise<{ status?: string; result?: string; id?: string }>;
      };
    };
    const result = await mod.Agent.prompt(prompt, {
      apiKey: cfg.CURSOR_API_KEY,
      model: { id: cfg.CURSOR_MODEL },
      local: { cwd: cfg.REPO_ROOT },
    });
    if (result.status === 'error') {
      return {
        status: 'error',
        summary: String(result.result || 'agent error'),
        agentId: result.id,
      };
    }
    return {
      status: 'ok',
      summary: String(result.result || 'ok'),
      agentId: result.id,
    };
  } catch (err) {
    return {
      status: 'error',
      summary: err instanceof Error ? err.message : String(err),
    };
  }
}
