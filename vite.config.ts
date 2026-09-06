import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const root = path.dirname(fileURLToPath(import.meta.url));

/** Local Hermes chat bridge — no tunnels; hits HITL OpenAI-compat when healthy. */
function localHermesCommandPlugin(): Plugin {
  return {
    name: 'local-hermes-command',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url || '';
        if (!url.startsWith('/api/admin/hermes-command') || req.method !== 'POST') {
          next();
          return;
        }
        const hermesBase = (
          process.env.VITE_HERMES_API_URL ||
          process.env.HERMES_API_URL ||
          'http://127.0.0.1:8790'
        ).replace(/\/$/, '');

        try {
          const chunks: Buffer[] = [];
          for await (const chunk of req) chunks.push(Buffer.from(chunk));
          const raw = Buffer.concat(chunks).toString('utf8');
          const body = raw ? JSON.parse(raw) : {};
          const message = String(body.message || body.text || '').slice(0, 8000);
          const codePatch = String(body.codeDiff || body.codePatch || '').slice(0, 40000);
          const projectId = String(body.projectId || body.project || 'resumora');
          const lang = String(body.lang || 'en');
          const prompt = [message, codePatch ? `\n\nCode patch:\n${codePatch}` : '']
            .join('')
            .trim();
          if (!prompt) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'message required' }));
            return;
          }

          const health = await fetch(`${hermesBase}/api/health`, {
            signal: AbortSignal.timeout(2500),
          }).catch(() => null);
          if (!health?.ok) {
            res.statusCode = 502;
            res.setHeader('Content-Type', 'application/json');
            res.end(
              JSON.stringify({
                error:
                  'Hermes local queue unreachable. Run npm run dev:all (start-bossmind.mjs) so HITL :8790 is up.',
              })
            );
            return;
          }

          const chatRes = await fetch(`${hermesBase}/v1/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({
              model: 'hermes-agent',
              stream: false,
              messages: [
                {
                  role: 'system',
                  content: `You are the BossMind harness assistant. Active project: ${projectId}. Reply in ${lang}.`,
                },
                { role: 'user', content: prompt },
              ],
            }),
            signal: AbortSignal.timeout(60_000),
          });
          const chatJson = (await chatRes.json().catch(() => ({}))) as {
            choices?: Array<{ message?: { content?: string } }>;
            error?: string;
          };
          if (!chatRes.ok) {
            res.statusCode = chatRes.status || 502;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: chatJson.error || `Hermes HTTP ${chatRes.status}` }));
            return;
          }
          const reply = String(chatJson?.choices?.[0]?.message?.content || '').trim();
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(
            JSON.stringify({
              ok: true,
              engine: 'hermes-local',
              projectId,
              reply,
              patchStored: Boolean(codePatch),
            })
          );
        } catch (err) {
          res.statusCode = 502;
          res.setHeader('Content-Type', 'application/json');
          res.end(
            JSON.stringify({
              error: err instanceof Error ? err.message : 'Hermes local bridge failed',
            })
          );
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, root, ['VITE_', 'NEXT_PUBLIC_', 'HERMES_']);
  const hermesTarget = (
    env.VITE_HERMES_API_URL ||
    env.HERMES_API_URL ||
    process.env.VITE_HERMES_API_URL ||
    process.env.HERMES_API_URL ||
    'http://127.0.0.1:8790'
  ).replace(/\/$/, '');

  const defineEnv: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (key.startsWith('NEXT_PUBLIC_STRIPE_') || key.startsWith('VITE_STRIPE_')) {
      defineEnv[`import.meta.env.${key}`] = JSON.stringify(value);
    }
  }
  defineEnv['import.meta.env.VITE_HERMES_API_URL'] = JSON.stringify(hermesTarget);

  return {
    root,
    plugins: [
      react(),
      tailwindcss(),
      localHermesCommandPlugin(),
      {
        name: 'admin-spa-fallback',
        configureServer(server) {
          server.middlewares.use((req, _res, next) => {
            const url = req.url || '';
            if (url.startsWith('/admin') && !url.includes('.')) {
              req.url = '/admin.html';
            }
            next();
          });
        },
      },
    ],
    envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
    define: defineEnv,
    server: {
      host: '127.0.0.1',
      port: 5173,
      strictPort: true,
      proxy: {
        // Admin APIs (except hermes-command, handled by local bridge) → production CF
        '/api/admin': {
          target: 'https://resumora.net',
          changeOrigin: true,
          secure: true,
          bypass(req) {
            if (req.url?.includes('/hermes-command')) return req.url;
          },
        },
        '/api/projects': {
          target: 'https://resumora.net',
          changeOrigin: true,
          secure: true,
        },
        '/api/owner': {
          target: 'https://resumora.net',
          changeOrigin: true,
          secure: true,
        },
      },
    },
    build: {
      rollupOptions: {
        input: {
          main: path.resolve(root, 'index.html'),
          admin: path.resolve(root, 'admin.html'),
          pricing: path.resolve(root, 'pricing.html'),
          studio: path.resolve(root, 'studio.html'),
          videos: path.resolve(root, 'videos.html'),
          resetPassword: path.resolve(root, 'reset-password.html'),
        },
      },
    },
  };
});
