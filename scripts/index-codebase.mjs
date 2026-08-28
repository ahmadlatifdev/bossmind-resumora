/**
 * Generate machine-readable codebase index for BossMind architecture docs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const outDir = path.join(root, 'docs');
const outFile = path.join(outDir, 'architecture-index.json');

const SCAN_DIRS = ['src', 'functions', 'scripts', 'server', 'tests', '.github/workflows'];
const EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.json', '.yml', '.yaml', '.md']);

function walk(dir, base = root) {
  const entries = [];
  if (!fs.existsSync(dir)) return entries;
  for (const name of fs.readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name === '.git') continue;
    const full = path.join(dir, name);
    const rel = path.relative(base, full).replace(/\\/g, '/');
    const stat = fs.statSync(full);
    if (stat.isDirectory()) entries.push(...walk(full, base));
    else if (EXT.has(path.extname(name))) {
      entries.push({
        path: rel,
        bytes: stat.size,
        ext: path.extname(name),
        modified: stat.mtime.toISOString(),
      });
    }
  }
  return entries;
}

const files = SCAN_DIRS.flatMap((d) => walk(path.join(root, d)));
const byExt = {};
for (const f of files) byExt[f.ext] = (byExt[f.ext] || 0) + 1;

const index = {
  generatedAt: new Date().toISOString(),
  project: 'bossmind-resumora',
  domain: 'resumora.net',
  totalFiles: files.length,
  byExtension: byExt,
  apiRoutes: [
    '/api/webhook',
    '/api/create-checkout-session',
    '/api/refund-preview',
    '/api/cancel-subscription',
    '/api/service-event',
    '/api/refunds',
    '/api/analytics/revenue',
    '/api/analytics/churn',
    '/api/admin/system-health',
  ],
  files: files.sort((a, b) => a.path.localeCompare(b.path)),
};

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(index, null, 2));
console.log(JSON.stringify({ ok: true, outFile, totalFiles: files.length }, null, 2));
