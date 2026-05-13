#!/usr/bin/env node
/**
 * Rasterize public/favicon.svg into PNG + favicon.ico (Resumora premium mark).
 * Run after editing the SVG: npm run bossmind:branding:icons
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
  console.log("resumora-brand-icons: wrote favicon.ico, favicon-*.png, apple-touch-icon.png, icon-192.png, icon-512.png");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
