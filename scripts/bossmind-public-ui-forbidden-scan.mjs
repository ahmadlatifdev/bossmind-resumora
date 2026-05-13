#!/usr/bin/env node
/**
 * Source-level guard: block legacy public engagement controls (e.g. thumbs / dislike)
 * from re-entering protected marketing components before deploy or task closure.
 *
 *   node scripts/bossmind-public-ui-forbidden-scan.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Only marketing UI — translations may still define legacy keys unused in JSX. */
const REL_DIRS = ["components/marketing"];

const RULES = [
  {
    id: "no-lucide-thumbs-marketing",
    re: /\bThumbs(Down|Up)\b/,
    message: "Remove ThumbsUp/ThumbsDown from marketing components (use trust/footer v2 patterns).",
  },
  {
    id: "no-footer-dislike-binding",
    re: /\bfooterEngageDislike\b/,
    message: "Do not bind footerEngageDislike in marketing JSX — public dislike is retired.",
  },
];

function walkFiles(dir, acc) {
  if (!fs.existsSync(dir)) return acc;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walkFiles(p, acc);
    else if (/\.(jsx|js|tsx|ts)$/i.test(name) && !name.endsWith(".test.js")) acc.push(p);
  }
  return acc;
}

function main() {
  const files = [];
  for (const rel of REL_DIRS) {
    walkFiles(path.join(root, rel), files);
  }
  const hits = [];
  for (const file of files) {
    let text;
    try {
      text = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    const rel = path.relative(root, file).replace(/\\/g, "/");
    for (const rule of RULES) {
      if (rule.re.test(text)) {
        hits.push({ file: rel, rule: rule.id, detail: rule.message });
      }
    }
  }
  if (hits.length) {
    console.error("bossmind-public-ui-forbidden-scan: FAILED");
    for (const h of hits) console.error(`  ${h.file} — ${h.rule}: ${h.detail}`);
    process.exit(1);
  }
  console.log(
    `bossmind-public-ui-forbidden-scan: OK (${files.length} files under ${REL_DIRS.join(", ")})`
  );
  process.exit(0);
}

main();
