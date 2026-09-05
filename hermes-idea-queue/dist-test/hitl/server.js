import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../config.js';
import { enqueueIdea } from '../queue/queues.js';
import {
  applyHitlDecision,
  assertHitlToken,
  listHitlPending,
  loadIdea,
} from '../safety/hitlStore.js';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
export function createHitlApp() {
  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(__dirname, 'public')));
  app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'hitl' }));
  app.get('/api/pending', async (req, res) => {
    try {
      assertHitlToken(req.header('authorization') || undefined);
      const pending = await listHitlPending();
      res.json({ ok: true, pending });
    } catch (err) {
      const status = err.statusCode || 500;
      res.status(status).json({ error: err instanceof Error ? err.message : 'error' });
    }
  });
  app.post('/api/decide', async (req, res) => {
    try {
      assertHitlToken(req.header('authorization') || undefined);
      const ideaId = String(req.body?.ideaId || '');
      const decision = String(req.body?.decision || '');
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
      const status = err.statusCode || 500;
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
      const status = err.statusCode || 500;
      res.status(status).json({ error: err instanceof Error ? err.message : 'error' });
    }
  });
  return app;
}
export function startHitlServer() {
  const cfg = loadConfig();
  const app = createHitlApp();
  app.listen(cfg.HITL_PORT, () => {
    console.log(`[hitl] dashboard http://127.0.0.1:${cfg.HITL_PORT}`);
  });
}
