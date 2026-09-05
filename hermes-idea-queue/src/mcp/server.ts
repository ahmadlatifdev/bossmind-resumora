import express from 'express';
import { compressContext } from '../rag/compressor.js';
import { loadIdea } from '../safety/hitlStore.js';
import { loadConfig } from '../config.js';

/**
 * Lightweight MCP-compatible HTTP server.
 * Tools:
 *  - compress_task_context: returns RAG-compressed pack for an idea id
 *  - health: liveness
 */
export function createMcpApp() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (_req, res) => {
    res.json({
      ok: true,
      service: 'hermes-idea-mcp',
      pinecone: Boolean(loadConfig().PINECONE_API_KEY),
    });
  });

  app.post('/mcp/tools/list', (_req, res) => {
    res.json({
      tools: [
        {
          name: 'compress_task_context',
          description: 'Fetch compressed RAG context for an idea-queue task id',
          inputSchema: {
            type: 'object',
            properties: { ideaId: { type: 'string' } },
            required: ['ideaId'],
          },
        },
      ],
    });
  });

  app.post('/mcp/tools/call', async (req, res) => {
    try {
      const name = String(req.body?.name || '');
      const args = (req.body?.arguments || {}) as { ideaId?: string };
      if (name !== 'compress_task_context') {
        res.status(400).json({ error: 'unknown tool' });
        return;
      }
      const idea = await loadIdea(String(args.ideaId || ''));
      if (!idea) {
        res.status(404).json({ error: 'idea not found' });
        return;
      }
      const pack = await compressContext(idea);
      res.json({
        content: [{ type: 'text', text: pack }],
        isError: false,
      });
    } catch (err) {
      res.status(500).json({
        content: [{ type: 'text', text: err instanceof Error ? err.message : 'error' }],
        isError: true,
      });
    }
  });

  return app;
}

export function startMcpServer(port = 8791): void {
  const app = createMcpApp();
  app.listen(port, () => console.log(`[mcp] listening on :${port}`));
}
