#!/usr/bin/env node
/**
 * Pre-deploy config gate — fails fast with actionable messages.
 * Never prints secret values (sk_live_, whsec_, pk_live_, price_).
 */
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const errors = [];
const warnings = [];

function fail(msg) {
  errors.push(msg);
}

function warn(msg) {
  warnings.push(msg);
}

function readJson(rel) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) {
    fail(`Missing required file: ${rel}`);
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    fail(`Invalid JSON in ${rel}: ${e.message}`);
    return null;
  }
}

const firebaseJson = readJson('firebase.json');
readJson('.firebaserc');

if (firebaseJson?.hosting) {
  const site = firebaseJson.hosting.site || firebaseJson.hosting[0]?.site;
  if (site !== 'client-resumora-live') {
    fail(
      `firebase.json hosting site must be client-resumora-live (resumora.net). Found: ${site || '(none)'}`
    );
  }
  if (firebaseJson.hosting.public !== 'dist') {
    fail(`firebase.json hosting.public must be "dist". Found: ${firebaseJson.hosting.public}`);
  }
} else if (firebaseJson) {
  fail('firebase.json has no hosting block');
}

for (const forbidden of ['.env.local', 'bilibili_secrets.env', 'firebase-service-account.json']) {
  if (fs.existsSync(path.join(root, forbidden))) {
    warn(`${forbidden} exists locally (gitignored) — must not be bundled into dist/`);
  }
}

const distDir = path.join(root, 'dist');
if (fs.existsSync(distDir)) {
  const indexHtml = path.join(distDir, 'index.html');
  if (!fs.existsSync(indexHtml)) {
    fail('Deployment failed due to invalid build output in dist/: missing dist/index.html');
  } else {
    const html = fs.readFileSync(indexHtml, 'utf8');
    if (!html.includes('id="root"') && !html.includes("id='root'")) {
      fail('Deployment failed due to invalid build output in dist/: index.html missing #root mount point');
    }
    if (!/resumora\.net/i.test(html) && !/RESUMORA/i.test(html)) {
      warn('dist/index.html does not reference resumora.net branding — smoke test may still pass via assets');
    }
  }

  const assetDir = path.join(distDir, 'assets');
  if (!fs.existsSync(assetDir) || fs.readdirSync(assetDir).filter((f) => f.endsWith('.js')).length === 0) {
    fail('Deployment failed due to invalid build output in dist/: no JS assets under dist/assets/');
  }

  const secretPatterns = [
    { re: /sk_live_[A-Za-z0-9]+/, label: 'Stripe live secret' },
    { re: /whsec_[A-Za-z0-9]+/, label: 'Stripe webhook secret' },
  ];
  for (const file of walk(distDir)) {
    if (!/\.(html|js|css|json)$/i.test(file)) continue;
    const body = fs.readFileSync(file, 'utf8');
    for (const { re, label } of secretPatterns) {
      if (re.test(body)) {
        fail(`Hardcoded secret pattern detected in build output (${label}) — abort deploy`);
        break;
      }
    }
  }
} else {
  warn('dist/ not present yet — artifact download may happen in deploy job');
}

function walk(dir, acc = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, acc);
    else acc.push(p);
  }
  return acc;
}

// Scan committed workflow-visible sources for accidental secret literals (not price_ plan maps in source)
const scanRoots = ['src', 'functions', 'index.html', 'videos.html'].filter((r) =>
  fs.existsSync(path.join(root, r))
);
for (const rel of scanRoots) {
  const target = path.join(root, rel);
  const files = fs.statSync(target).isDirectory() ? walk(target) : [target];
  for (const file of files) {
    if (!/\.(tsx?|jsx?|html|env)$/i.test(file)) continue;
    if (file.includes('node_modules')) continue;
    const body = fs.readFileSync(file, 'utf8');
    if (/sk_live_[A-Za-z0-9]+/.test(body) || /whsec_[A-Za-z0-9]+/.test(body)) {
      fail(`Hardcoded secret in source tree: ${path.relative(root, file)} — use environment variables`);
    }
  }
}

for (const w of warnings) console.warn(`WARN: ${w}`);

if (errors.length) {
  console.error('verify-config: FAILED');
  for (const e of errors) console.error(`  - ${e}`);
  console.error('\nNext steps: fix config/build locally (npm run build), re-run master-pipeline Validate, push fix.');
  process.exit(1);
}

console.log('verify-config: Success — firebase.json, .firebaserc, and build guards OK');
