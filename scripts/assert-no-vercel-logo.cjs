/**
 * Fail the build if Vercel / Vite platform logo files or <img>/<VercelLogo> usages reappear.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SCAN_DIRS = ['src', 'public', path.join('cloud-run-apex', 'dist')];
const BANNED_NAMES = /^(vercel\.svg|vite\.svg)$/i;
const BANNED_USAGE = [
  /src=["']\/?(?:vercel|vite)\.svg["']/i,
  /href=["']\/?(?:vercel|vite)\.svg["']/i,
  /<VercelLogo\b/i,
  /from\s+['"][^'"]*vercel\.svg['"]/i,
];

const offenders = [];

function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === 'node_modules' || ent.name === '.git') continue;
      walk(full);
      continue;
    }
    const rel = path.relative(ROOT, full).replace(/\\/g, '/');
    if (BANNED_NAMES.test(ent.name)) {
      offenders.push(rel);
      continue;
    }
    if (!/\.(tsx?|jsx?|css|html|svg)$/i.test(ent.name)) continue;
    let text = '';
    try {
      text = fs.readFileSync(full, 'utf8');
    } catch {
      continue;
    }
    for (const re of BANNED_USAGE) {
      if (re.test(text)) {
        offenders.push(`${rel} (matched ${re})`);
        break;
      }
    }
  }
}

for (const d of SCAN_DIRS) walk(path.join(ROOT, d));

if (offenders.length) {
  console.error('[assert-no-vercel-logo] Forbidden platform logo assets found:');
  for (const o of offenders) console.error(' -', o);
  process.exit(1);
}

console.log('[assert-no-vercel-logo] OK — no Vercel/vite logo files or references');
