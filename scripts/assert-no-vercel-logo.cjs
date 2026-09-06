/**
 * Fail the build if Vercel / platform triangle logos reappear under src/ or public/.
 * Policy: Firebase Hosting only (resumora.net). See docs/VERCEL_DEPRECATION.md.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SCAN_DIRS = ['src', 'public'];
const BANNED_NAMES = /^(vercel\.svg|vite\.svg)$/i;
const BANNED_CONTENT = [/vercel\.svg/i, /▲\s*Vercel/i, /powered by vercel/i];

const offenders = [];

function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === 'node_modules' || ent.name === 'dist') continue;
      walk(full);
      continue;
    }
    const rel = path.relative(ROOT, full).replace(/\\/g, '/');
    if (BANNED_NAMES.test(ent.name)) {
      offenders.push(rel);
      continue;
    }
    if (!/\.(tsx?|jsx?|css|html|svg|md)$/i.test(ent.name)) continue;
    let text = '';
    try {
      text = fs.readFileSync(full, 'utf8');
    } catch {
      continue;
    }
    for (const re of BANNED_CONTENT) {
      if (re.test(text)) {
        offenders.push(`${rel} (matched ${re})`);
        break;
      }
    }
  }
}

for (const d of SCAN_DIRS) walk(path.join(ROOT, d));

if (offenders.length) {
  console.error('[assert-no-vercel-logo] Forbidden Vercel/platform logo assets found:');
  for (const o of offenders) console.error(' -', o);
  process.exit(1);
}

console.log('[assert-no-vercel-logo] OK — no Vercel/vite logo assets under src/ or public/');
