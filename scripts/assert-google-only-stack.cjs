#!/usr/bin/env node
/**
 * Fail CI/build if dropped-platform hosting or non-Google checkout hosts reappear.
 * Allowed API hosts: resumora.net relative /api, *.cloudfunctions.net, *.run.app (GCP).
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const bannedFiles = ['vercel.json', 'netlify.toml', 'wrangler.toml', 'railway.json', 'render.yaml'];
const errors = [];

for (const name of bannedFiles) {
  if (fs.existsSync(path.join(root, name))) {
    errors.push(`Forbidden platform config present: ${name}`);
  }
}

const scanRoots = [
  path.join(root, 'src'),
  path.join(root, 'functions'),
  path.join(root, 'scripts'),
];
const bannedHostRe =
  /https?:\/\/[^\s"'`)]*(vercel\.app|netlify\.app|onrender\.com|railway\.app|pages\.dev)[^\s"'`)]*/gi;
const hardcodedLipRe = /createcheckoutsession-[a-z0-9]+-uc\.a\.run\.app/gi;

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === 'node_modules' || ent.name === 'dist') continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (/\.(js|jsx|ts|tsx|mjs|cjs|html|json)$/.test(ent.name)) out.push(p);
  }
  return out;
}

for (const base of scanRoots) {
  for (const file of walk(base)) {
    const text = fs.readFileSync(file, 'utf8');
    const rel = path.relative(root, file);
    if (bannedHostRe.test(text)) {
      errors.push(`Dropped-platform host URL in ${rel}`);
    }
    bannedHostRe.lastIndex = 0;
    if (hardcodedLipRe.test(text) && !rel.includes('PERFORMANCE_100')) {
      errors.push(`Hardcoded volatile Cloud Run revision host in ${rel} — use /api rewrite or cloudfunctions.net`);
    }
    hardcodedLipRe.lastIndex = 0;
  }
}

if (errors.length) {
  console.error('[assert-google-only-stack] FAILED');
  for (const e of errors) console.error(` - ${e}`);
  process.exit(1);
}
console.log('[assert-google-only-stack] OK — Google Hosting/Functions only');
