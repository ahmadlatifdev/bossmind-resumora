/**
 * UI consistency check — header/footer SSoT regression.
 *
 * Visits `/`, `/pricing`, `/account`, `/video-library`, captures SiteHeader/SiteFooter,
 * asserts DOM chrome fingerprints match, and compares screenshots (tolerant pixel diff).
 *
 * Usage:
 *   node scripts/ui-consistency-check.js --serve
 *   BASE_URL=https://resumora.net node scripts/ui-consistency-check.js
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');
const outDir = path.join(root, 'artifacts', 'ui-consistency');
const ROUTES = ['/', '/pricing', '/account', '/video-library'];
const MAX_DIFF_PIXELS = Number(process.env.UI_MAX_DIFF_PIXELS || 2000);
const wantServe = process.argv.includes('--serve') || process.env.UI_SERVE === '1';

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return (
    {
      '.html': 'text/html; charset=utf-8',
      '.js': 'text/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.png': 'image/png',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon',
      '.woff2': 'font/woff2',
      '.json': 'application/json',
    }[ext] || 'application/octet-stream'
  );
}

/** Minimal static server mirroring Firebase Hosting SPA + MPA rewrites. */
function startRewriteServer(port = 4173) {
  if (!fs.existsSync(dist)) {
    throw new Error(`dist/ missing — run npm run build first`);
  }

  const spaRoutes = new Set(['/', '/account', '/video-library', '/login']);
  const htmlMap = {
    '/pricing': 'pricing.html',
    '/studio': 'studio.html',
    '/resume-studio': 'studio.html',
    '/videos': 'videos.html',
    '/reset-password': 'reset-password.html',
  };

  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', `http://127.0.0.1:${port}`);
    let pathname = decodeURIComponent(url.pathname);

    if (htmlMap[pathname]) {
      pathname = `/${htmlMap[pathname]}`;
    } else if (spaRoutes.has(pathname) || (!path.extname(pathname) && !pathname.includes('.'))) {
      // SPA fallback for App router paths
      if (spaRoutes.has(pathname) || pathname === '/') {
        pathname = '/index.html';
      }
    }

    const filePath = path.join(dist, pathname === '/' ? 'index.html' : pathname);
    if (
      !filePath.startsWith(dist) ||
      !fs.existsSync(filePath) ||
      fs.statSync(filePath).isDirectory()
    ) {
      res.writeHead(404).end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType(filePath) });
    fs.createReadStream(filePath).pipe(res);
  });

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

async function pixelDiffCount(pngA, pngB) {
  const imgA = PNG.sync.read(pngA);
  const imgB = PNG.sync.read(pngB);
  if (imgA.width !== imgB.width || imgA.height !== imgB.height) {
    console.warn(
      `[ui-consistency] size mismatch ${imgA.width}x${imgA.height} vs ${imgB.width}x${imgB.height}`
    );
    return Number.MAX_SAFE_INTEGER;
  }
  const { width, height } = imgA;
  const diff = new PNG({ width, height });
  return pixelmatch(imgA.data, imgB.data, diff.data, width, height, { threshold: 0.15 });
}

async function captureChrome(page, route) {
  await page.goto(`${process.env.BASE_URL}${route}`, {
    waitUntil: 'networkidle',
    timeout: 60000,
  });
  await page.waitForSelector('[data-ssot="site-header"]', { timeout: 30000 });
  await page.waitForSelector('[data-ssot="site-footer"]', { timeout: 30000 });

  // Normalize active-state styling so chrome screenshots are comparable.
  await page.evaluate(() => {
    document.querySelectorAll('[aria-current]').forEach((el) => el.removeAttribute('aria-current'));
  });
  await page.evaluate(() => document.fonts.ready);
  // Extra settle so webfonts paint before chrome screenshots.
  await page.waitForTimeout(400);

  const header = page.locator('[data-ssot="site-header"]');
  const footer = page.locator('[data-ssot="site-footer"]');
  if ((await header.count()) !== 1 || (await footer.count()) !== 1) {
    throw new Error(`${route}: expected one SiteHeader and one SiteFooter`);
  }

  const langCount = await page
    .locator('[data-ssot="site-header"] .lang-btn, [data-ssot="site-header"] .lang-toggle button')
    .count();
  if (langCount < 3) {
    throw new Error(`${route}: EN/FR/ES language switcher missing (count=${langCount})`);
  }

  const fingerprint = await page.evaluate(() => {
    const h = document.querySelector('[data-ssot="site-header"]');
    const f = document.querySelector('[data-ssot="site-footer"]');
    return {
      headerHrefs: [...h.querySelectorAll('nav a')].map((a) => a.getAttribute('href')),
      logoSrc: h.querySelector('.site-logo__mark')?.getAttribute('src') || null,
      logoText: h.querySelector('.site-logo__text')?.textContent?.trim() || null,
      langs: [...h.querySelectorAll('.lang-btn, .lang-toggle button')].map((b) =>
        b.textContent.trim()
      ),
      footerHrefs: [...f.querySelectorAll('a')].map((a) => a.getAttribute('href')),
      footerBrand: f.querySelector('.site-footer__brand')?.textContent?.trim() || null,
    };
  });

  const headerPng = await header.screenshot({ type: 'png' });
  const footerPng = await footer.screenshot({ type: 'png' });
  const slug = route === '/' ? 'home' : route.replace(/^\//, '').replace(/\//g, '_');
  fs.writeFileSync(path.join(outDir, `${slug}-header.png`), headerPng);
  fs.writeFileSync(path.join(outDir, `${slug}-footer.png`), footerPng);
  fs.writeFileSync(
    path.join(outDir, `${slug}-fingerprint.json`),
    JSON.stringify(fingerprint, null, 2)
  );

  return { route, slug, headerPng, footerPng, fingerprint, finalUrl: page.url() };
}

function fingerprintsEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

async function main() {
  ensureDir(outDir);
  let server = null;
  let base = (process.env.BASE_URL || '').replace(/\/$/, '');

  if (wantServe || !base) {
    server = await startRewriteServer(4173);
    base = 'http://127.0.0.1:4173';
    process.env.BASE_URL = base;
  }

  console.log(`[ui-consistency] BASE_URL=${base}`);
  console.log(`[ui-consistency] routes=${ROUTES.join(', ')}`);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const captures = [];

  try {
    for (const route of ROUTES) {
      const cap = await captureChrome(page, route);
      console.log(`[ui-consistency] captured ${route} → ${cap.finalUrl}`);
      captures.push(cap);
    }
  } finally {
    await browser.close();
    if (server) server.close();
  }

  const baseline = captures[0];
  let failed = false;
  const report = [];

  for (let i = 1; i < captures.length; i++) {
    const cap = captures[i];
    const fpOk = fingerprintsEqual(baseline.fingerprint, cap.fingerprint);
    const headerDiff = await pixelDiffCount(baseline.headerPng, cap.headerPng);
    const footerDiff = await pixelDiffCount(baseline.footerPng, cap.footerPng);
    const headerOk = headerDiff <= MAX_DIFF_PIXELS;
    const footerOk = footerDiff <= MAX_DIFF_PIXELS;
    // Hard gates: DOM fingerprint (SSoT) + header pixels. Footer pixels warn (copy/wrap noise).
    const ok = fpOk && headerOk;
    report.push({
      route: cap.route,
      fpOk,
      headerDiff,
      footerDiff,
      headerOk,
      footerOk,
    });
    console.log(
      `[ui-consistency] ${cap.route} vs ${baseline.route}: fingerprint=${fpOk ? 'OK' : 'FAIL'} headerDiff=${headerDiff} footerDiff=${footerDiff} ${
        ok ? 'OK' : 'FAIL'
      }`
    );
    if (!ok) failed = true;
    if (!footerOk) {
      console.warn(`[ui-consistency] footer pixel WARN on ${cap.route} (diff=${footerDiff})`);
    }
  }

  fs.writeFileSync(
    path.join(outDir, 'report.json'),
    JSON.stringify(
      { baseline: baseline.route, baselineFingerprint: baseline.fingerprint, report },
      null,
      2
    )
  );

  if (failed) {
    console.error('[ui-consistency] FAILED — shared header/footer chrome is inconsistent.');
    process.exit(1);
  }
  console.log('[ui-consistency] PASSED — SiteHeader/SiteFooter SSoT holds across routes.');
}

main().catch((err) => {
  console.error('[ui-consistency] ERROR', err?.message || err);
  process.exit(1);
});
