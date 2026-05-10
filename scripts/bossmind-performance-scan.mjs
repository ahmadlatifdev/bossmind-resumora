#!/usr/bin/env node
/**
 * Local performance / bundle heuristics (runs without a browser).
 */
import { readdirSync, statSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function walkFiles(dir, acc, maxFiles = 8000) {
  if (acc.length >= maxFiles) return;
  let entries = [];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.name.startsWith(".")) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkFiles(p, acc, maxFiles);
    else {
      acc.push(p);
      if (acc.length >= maxFiles) return;
    }
  }
}

const mem = process.memoryUsage();
const jsFiles = [];
walkFiles(path.join(root, "components"), jsFiles, 4000);

let totalJsBytes = 0;
let largeJs = [];
for (const f of jsFiles.slice(0, 4000)) {
  try {
    const s = statSync(f);
    totalJsBytes += s.size;
    if (s.size > 42000) largeJs.push({ rel: path.relative(root, f), kb: Math.round(s.size / 1024) });
  } catch {
    /* ignore */
  }
}
largeJs.sort((a, b) => b.kb - a.kb);

const chunks = [];
const nextStatic = path.join(root, ".next", "static");
if (existsSync(nextStatic)) {
  function walkChunk(d) {
    let es = [];
    try {
      es = readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of es) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walkChunk(p);
      else if (/\.(js|css)$/i.test(e.name)) {
        try {
          const s = statSync(p);
          chunks.push({ rel: path.relative(root, p), kb: Math.round(s.size / 1024) });
        } catch {
          /* ignore */
        }
      }
    }
  }
  walkChunk(nextStatic);
}
chunks.sort((a, b) => b.kb - a.kb);

const publicLarge = [];
const pub = path.join(root, "public");
if (existsSync(pub)) {
  const imgs = [];
  walkFiles(pub, imgs, 800);
  for (const f of imgs) {
    if (!/\.(png|jpe?g|webp|gif|svg)$/i.test(f)) continue;
    try {
      const s = statSync(f);
      if (s.size > 450000) publicLarge.push({ rel: path.relative(root, f), kb: Math.round(s.size / 1024) });
    } catch {
      /* ignore */
    }
  }
}

const report = {
  ts: Date.now(),
  rssMb: Math.round(mem.rss / (1024 * 1024)),
  heapUsedMb: Math.round(mem.heapUsed / (1024 * 1024)),
  componentsScanned: jsFiles.length,
  componentsSourceKb: Math.round(totalJsBytes / 1024),
  largestComponentFiles: largeJs.slice(0, 15),
  largestBuiltChunks: chunks.slice(0, 15),
  largePublicImagesKb: publicLarge.slice(0, 12),
};

console.log(JSON.stringify(report, null, 2));
