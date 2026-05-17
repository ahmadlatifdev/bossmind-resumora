#!/usr/bin/env node
/**
 * Rasterize favicon.svg + resumora-logo.svg into PNG/ICO, OG card, android-chrome, and service worker sync.
 * Run after editing SVGs or config/branding-asset-version.json: npm run bossmind:branding:icons
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import sharp from "sharp";

const require = createRequire(import.meta.url);
const toIco = require("to-ico");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const pub = path.join(root, "public");
const svgPath = path.join(pub, "favicon.svg");

async function main() {
  if (!fs.existsSync(svgPath)) {
    console.error("resumora-brand-icons: missing public/favicon.svg");
    process.exit(1);
  }
  const svg = fs.readFileSync(svgPath);
  const png16 = await sharp(svg).resize(16, 16).png().toBuffer();
  const png32 = await sharp(svg).resize(32, 32).png().toBuffer();
  const png180 = await sharp(svg).resize(180, 180).png().toBuffer();
  const png192 = await sharp(svg).resize(192, 192).png().toBuffer();
  const png512 = await sharp(svg).resize(512, 512).png().toBuffer();

  fs.writeFileSync(path.join(pub, "favicon-16x16.png"), png16);
  fs.writeFileSync(path.join(pub, "favicon-32x32.png"), png32);
  fs.writeFileSync(path.join(pub, "apple-touch-icon.png"), png180);
  fs.writeFileSync(path.join(pub, "icon-192.png"), png192);
  fs.writeFileSync(path.join(pub, "icon-512.png"), png512);

  const ico = await toIco([png16, png32]);
  fs.writeFileSync(path.join(pub, "favicon.ico"), ico);

  const lockedLogoPath = path.join(pub, "brand", "resumora-logo-official.png");
  if (!fs.existsSync(lockedLogoPath)) {
    console.error("resumora-brand-icons: missing public/brand/resumora-logo-official.png (brand authority lock)");
    process.exit(1);
  }
  const logoPngBuf = fs.readFileSync(lockedLogoPath);

  const ogLogo = await sharp(logoPngBuf).resize({ width: 780 }).ensureAlpha().png().toBuffer();
  const ogPng = await sharp({
    create: {
      width: 1200,
      height: 630,
      channels: 4,
      background: { r: 4, g: 8, b: 20, alpha: 1 },
    },
  })
    .composite([{ input: ogLogo, gravity: "center" }])
    .png()
    .toBuffer();
  fs.writeFileSync(path.join(pub, "og-resumora-brand.png"), ogPng);

  fs.copyFileSync(path.join(pub, "favicon.svg"), path.join(pub, "icon.svg"));
  fs.copyFileSync(path.join(pub, "icon-192.png"), path.join(pub, "android-chrome-192x192.png"));
  fs.copyFileSync(path.join(pub, "icon-512.png"), path.join(pub, "android-chrome-512x512.png"));

  const ver = JSON.parse(fs.readFileSync(path.join(root, "config", "branding-asset-version.json"), "utf8")).version;
  const q = `?v=${String(ver).replace(/"/g, "")}`;
  const swPath = path.join(pub, "sw.js");
  let sw = fs.readFileSync(swPath, "utf8");
  sw = sw.replace(/const BRANDING_ASSET_QUERY = "[^"]*"/, `const BRANDING_ASSET_QUERY = "${q}"`);
  sw = sw.replace(/const CACHE = "resumora-shell-[^"]*"/, `const CACHE = "resumora-shell-${ver}"`);
  fs.writeFileSync(swPath, sw);

  const idxPath = path.join(pub, "index.html");
  if (fs.existsSync(idxPath)) {
    let html = fs.readFileSync(idxPath, "utf8");
    html = html.replace(/\?v=[^"&\s)]+/g, `?v=${ver}`);
    fs.writeFileSync(idxPath, html);
  }

  console.log(
    "resumora-brand-icons: wrote favicon.ico, favicon-*.png, apple-touch-icon.png, icon-192/512, android-chrome-*, icon.svg, og-resumora-brand.png (logo source: brand/resumora-logo-official.png); synced sw.js"
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
