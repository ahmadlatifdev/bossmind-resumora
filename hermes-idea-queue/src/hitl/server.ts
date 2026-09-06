import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { loadConfig, resetConfigCache } from '../config.js';
import { enqueueIdea } from '../queue/queues.js';
import {
  applyHitlDecision,
  assertHitlToken,
  listHitlPending,
  loadIdea,
} from '../safety/hitlStore.js';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');

/** Minimal .env loader (no extra deps) — KEY=VALUE lines into process.env. */
function applyEnvFile(filePath: string): boolean {
  if (!fs.existsSync(filePath)) return false;
  const text = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
  return true;
}

/** OpenAI-compatible Hermes surface on HITL — no tunnels; local LLM or stub. */
function mountHermesOpenAiCompat(app: express.Express): void {
  app.get('/v1/models', (_req, res) => {
    const cfg = loadConfig();
    res.json({
      object: 'list',
      data: [{ id: cfg.HERMES_LLM_MODEL || 'hermes-agent', object: 'model', owned_by: 'bossmind' }],
    });
  });

  app.post('/v1/chat/completions', async (req, res) => {
    const cfg = loadConfig();
    const body = req.body || {};
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const stream = Boolean(body.stream);
    const wantStub = !cfg.HERMES_LLM_API_KEY;

    async function completionText(): Promise<string> {
      if (wantStub) {
        const lastUser = [...messages].reverse().find((m: { role?: string }) => m.role === 'user');
        const preview = String((lastUser as { content?: string } | undefined)?.content || '').slice(
          0,
          120
        );
        return (
          `Hermes local queue is online (HITL :${cfg.HITL_PORT}). ` +
          (preview ? `Received: "${preview}${preview.length >= 120 ? '…' : ''}". ` : '') +
          'Set HERMES_LLM_API_KEY in hermes-idea-queue/.env for full LLM replies.'
        );
      }
      const upstream = `${cfg.HERMES_LLM_BASE_URL.replace(/\/$/, '')}/chat/completions`;
      const upstreamRes = await fetch(upstream, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cfg.HERMES_LLM_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: body.model || cfg.HERMES_LLM_MODEL,
          temperature: body.temperature ?? 0.2,
          stream: false,
          messages,
        }),
        signal: AbortSignal.timeout(60_000),
      });
      if (!upstreamRes.ok) {
        const errText = await upstreamRes.text().catch(() => '');
        throw Object.assign(new Error(`Upstream LLM HTTP ${upstreamRes.status}`), {
          statusCode: 502,
          detail: errText.slice(0, 200),
        });
      }
      const json = (await upstreamRes.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      return String(json?.choices?.[0]?.message?.content || '').trim() || '(empty reply)';
    }

    try {
      const text = await completionText();
      if (stream) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.write(
          `data: ${JSON.stringify({
            id: `chatcmpl-local-${Date.now()}`,
            object: 'chat.completion.chunk',
            choices: [{ index: 0, delta: { content: text }, finish_reason: null }],
          })}\n\n`
        );
        res.write('data: [DONE]\n\n');
        res.end();
        return;
      }
      res.json({
        id: `chatcmpl-local-${Date.now()}`,
        object: 'chat.completion',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: text },
            finish_reason: 'stop',
          },
        ],
      });
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode || 500;
      res.status(status).json({
        error: err instanceof Error ? err.message : 'completion failed',
      });
    }
  });
}

export function createHitlApp() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));
  app.use(express.static(path.join(__dirname, 'public')));

  app.get('/api/health', (_req, res) =>
    res.json({ ok: true, service: 'hitl', hermesCompat: true })
  );

  mountHermesOpenAiCompat(app);

  app.get('/api/pending', async (req, res) => {
    try {
      assertHitlToken(req.header('authorization') || undefined);
      const pending = await listHitlPending();
      res.json({ ok: true, pending });
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode || 500;
      res.status(status).json({ error: err instanceof Error ? err.message : 'error' });
    }
  });

  app.post('/api/decide', async (req, res) => {
    try {
      assertHitlToken(req.header('authorization') || undefined);
      const ideaId = String(req.body?.ideaId || '');
      const decision = String(req.body?.decision || '') as 'approve' | 'reject';
      const reviewer = String(req.body?.reviewer || 'human');
      const note = req.body?.note ? String(req.body.note) : undefined;
      if (!ideaId || (decision !== 'approve' && decision !== 'reject')) {
        res.status(400).json({ error: 'ideaId and decision required' });
        return;
      }
      const idea = await applyHitlDecision({
        ideaId,
        decision,
        reviewer,
        note,
        at: new Date().toISOString(),
      });
      if (decision === 'approve') {
        await enqueueIdea(
          { ideaId, attempt: 0, trigger: 'hitl_approved' },
          { priority: Math.round(100 - idea.priorityScore) }
        );
      }
      res.json({ ok: true, idea });
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode || 500;
      res.status(status).json({ error: err instanceof Error ? err.message : 'error' });
    }
  });

  app.get('/api/idea/:id', async (req, res) => {
    try {
      assertHitlToken(req.header('authorization') || undefined);
      const idea = await loadIdea(req.params.id);
      if (!idea) {
        res.status(404).json({ error: 'not found' });
        return;
      }
      res.json({ ok: true, idea });
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode || 500;
      res.status(status).json({ error: err instanceof Error ? err.message : 'error' });
    }
  });

  /** BRoC local helpers — no new deps; git backup + stack hint for Mission Control. */
  app.get('/api/broc/health', (_req, res) => {
    const cfg = loadConfig();
    res.json({
      ok: true,
      hitlPort: cfg.HITL_PORT,
      mcpPort: cfg.MCP_PORT,
      autoRecovery: true,
      intervalMs: 10000,
    });
  });

  app.post('/api/broc/local-backup', async (req, res) => {
    try {
      const commit = Boolean(req.body?.commit);
      const script = path.join(repoRoot, 'scripts', 'broc-auto-backup.cjs');
      const args = commit ? [script, '--commit'] : [script];
      const { stdout } = await execFileAsync(process.execPath, args, {
        cwd: repoRoot,
        timeout: 120_000,
        windowsHide: true,
      });
      const parsed = JSON.parse(String(stdout || '{}'));
      res.json({ ok: true, local: true, ...parsed });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : 'local backup failed',
      });
    }
  });

  app.post('/api/broc/autofix-hint', (_req, res) => {
    res.json({
      ok: true,
      command: 'npm run dev:all',
      message:
        'Run npm run dev:all in the Resumora repo to sync Vite (:5173) with hermes-idea-queue (:8790/:8791).',
      ports: [5173, 8790, 8791],
    });
  });

  /** Reload root + queue .env into process (CHECKOUT_SESSION_PREFIX etc.) without full process exit. */
  app.post('/api/broc/reload-env', (_req, res) => {
    try {
      const rootEnv = path.join(repoRoot, '.env');
      const rootEnvLocal = path.join(repoRoot, '.env.local');
      const queueEnv = path.join(repoRoot, 'hermes-idea-queue', '.env');
      const loaded: string[] = [];
      for (const file of [rootEnv, rootEnvLocal, queueEnv]) {
        if (applyEnvFile(file)) loaded.push(file);
      }
      resetConfigCache();
      const cfg = loadConfig();
      res.json({
        ok: true,
        loaded,
        checkoutSessionPrefix: process.env.CHECKOUT_SESSION_PREFIX || null,
        hitlPort: cfg.HITL_PORT,
        mcpPort: cfg.MCP_PORT,
        message: 'Env reloaded for hermes-idea-queue process',
      });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : 'reload-env failed',
      });
    }
  });

  return app;
}

export function startHitlServer(): void {
  const cfg = loadConfig();
  const app = createHitlApp();
  app.listen(cfg.HITL_PORT, '127.0.0.1', () => {
    console.log(`[hitl] dashboard http://127.0.0.1:${cfg.HITL_PORT}`);
    console.log(`[hitl] OpenAI-compat http://127.0.0.1:${cfg.HITL_PORT}/v1/chat/completions`);
  });
}
