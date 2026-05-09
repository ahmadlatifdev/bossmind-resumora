/**
 * Indexes BossMind paths into a Shakhsy hub manifest (dedupe by SHA256 of relative path + size).
 * Excludes common private folders when BOSSMIND_HUB_EXCLUDE matches basename.
 *
 * Usage:
 *   set SHAKHSY_HUB=D:\Shakhsy11
 *   set BOSSMIND_INDEX_ROOTS=D:\BossMind
 *   node scripts/bossmind-hub-index.mjs
 */
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";

const HUB = process.env.SHAKHSY_HUB || path.join("D:", "Shakhsy11");
const ROOTS = (process.env.BOSSMIND_INDEX_ROOTS || path.join("D:", "BossMind")).split(";").map((s) => s.trim()).filter(Boolean);
const EXCLUDE_NAMES = new Set(
  (process.env.BOSSMIND_HUB_EXCLUDE || "Private,Personal,.git,node_modules,.next,dist,build")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
);

async function sha256(str) {
  return crypto.createHash("sha256").update(str, "utf8").digest("hex");
}

async function safeStat(p) {
  try {
    return await fs.stat(p);
  } catch {
    return null;
  }
}

async function walk(rootAbs, relPrefix, entries, seenContent) {
  const stat = await safeStat(rootAbs);
  if (!stat || !stat.isDirectory()) return;

  let dirents = [];
  try {
    dirents = await fs.readdir(rootAbs, { withFileTypes: true });
  } catch {
    return;
  }

  for (const d of dirents) {
    const name = d.name;
    if (EXCLUDE_NAMES.has(name)) continue;

    const abs = path.join(rootAbs, name);
    const rel = path.join(relPrefix, name);

    if (d.isDirectory()) {
      await walk(abs, rel, entries, seenContent);
      continue;
    }

    if (!d.isFile()) continue;
    const st = await safeStat(abs);
    if (!st) continue;
    const key = await sha256(`${rel}|${st.size}`);
    if (seenContent.has(key)) continue;
    seenContent.add(key);
    entries.push({
      path: rel.split(path.sep).join("/"),
      size: st.size,
      mtime: st.mtime.toISOString(),
    });
  }
}

async function main() {
  const seen = new Set();
  const entries = [];
  for (const r of ROOTS) {
    await walk(r, path.basename(r) || r, entries, seen);
  }

  const outDir = path.join(HUB, ".bossmind-index");
  await fs.mkdir(outDir, { recursive: true });
  const manifest = {
    generatedAt: new Date().toISOString(),
    roots: ROOTS,
    entryCount: entries.length,
    entries: entries.sort((a, b) => a.path.localeCompare(b.path)),
  };
  const outFile = path.join(outDir, "manifest.json");
  await fs.writeFile(outFile, JSON.stringify(manifest, null, 2), "utf8");
  process.stdout.write(`Wrote ${outFile} (${entries.length} entries)\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
