#!/usr/bin/env node
/**
 * Safe Chrome bookmark audit + deduped Netscape HTML export for manual import.
 * Does NOT write Cookies, Login Data, Preferences sessions, or live Bookmarks JSON merge.
 *
 *   node scripts/chrome-bookmark-consolidation.mjs
 *   node scripts/chrome-bookmark-consolidation.mjs --master-name=Ahmed
 *   node scripts/chrome-bookmark-consolidation.mjs --backup-bookmarks
 *
 * After export: quit Chrome → Ahmed profile → Bookmarks → ⋮ → Import bookmarks → pick generated HTML.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function arg(name, def = "") {
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (eq) return eq.slice(`--${name}=`.length).trim();
  return def;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function loadConfig() {
  const p = path.join(root, "config", "chrome-bookmark-consolidation.json");
  const j = JSON.parse(fs.readFileSync(p, "utf8"));
  return j;
}

function chromeUserDataDir() {
  const la = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
  return path.join(la, "Google", "Chrome", "User Data");
}

function readJsonSafe(p) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

/** @param {string} url */
function normalizeUrl(url) {
  try {
    const u = new URL(url);
    u.hash = "";
    return u.href.replace(/\/$/, "");
  } catch {
    return String(url).trim();
  }
}

function urlMatchesInclude(url, substrings) {
  const lower = url.toLowerCase();
  return substrings.some((s) => lower.includes(String(s).toLowerCase()));
}

/**
 * @param {unknown} node
 * @param {{ url: string, name: string, profile: string }[]} out
 */
function walkBookmarks(node, profile, out) {
  if (!node || typeof node !== "object") return;
  const t = node.type;
  if (t === "url" && typeof node.url === "string") {
    out.push({ url: node.url, name: typeof node.name === "string" ? node.name : node.url, profile });
    return;
  }
  if (Array.isArray(node.children)) {
    for (const c of node.children) walkBookmarks(c, profile, out);
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function toNetscapeHtml(bookmarks, title) {
  const now = Math.floor(Date.now() / 1000);
  const lines = [
    "<!DOCTYPE NETSCAPE-Bookmark-file-1>",
    "<!-- Merged by BossMind chrome-bookmark-consolidation.mjs — import into master profile only after Chrome quit on other profiles if paranoid. -->",
    '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
    `<TITLE>${escapeHtml(title)}</TITLE>`,
    "<H1>Bookmarks</H1>",
    "<DL><p>",
  ];
  for (const b of bookmarks) {
    const u = escapeHtml(b.url);
    const n = escapeHtml(b.name || b.url);
    lines.push(`    <DT><A HREF="${u}" ADD_DATE="${now}">${n}</A>`);
  }
  lines.push("</DL><p>", "");
  return lines.join("\n");
}

function listProfileDirs(userData) {
  if (!fs.existsSync(userData)) return [];
  const names = fs
    .readdirSync(userData, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
  const out = [];
  for (const n of names) {
    if (n === "Default" || /^Profile \d+$/i.test(n) || n === "Guest Profile") {
      const bookmarksPath = path.join(userData, n, "Bookmarks");
      if (fs.existsSync(bookmarksPath)) out.push(n);
    }
  }
  return out.sort((a, b) => {
    if (a === "Default") return -1;
    if (b === "Default") return 1;
    return a.localeCompare(b, undefined, { numeric: true });
  });
}

function isManagedProfile(userData, profileDir) {
  const mp = path.join(userData, profileDir, "Managed Preferences");
  return fs.existsSync(mp);
}

async function main() {
  const cfg = loadConfig();
  const userData = chromeUserDataDir();
  const masterNameArg = arg("master-name", (cfg.masterProfileDisplayNameMatch || ["Ahmed"])[0]);
  const masterMatchers = (cfg.masterProfileDisplayNameMatch || [masterNameArg]).map((s) => String(s).toLowerCase());

  const localStatePath = path.join(userData, "Local State");
  const localState = readJsonSafe(localStatePath);
  const infoCache = localState?.profile?.info_cache || {};

  const profileDirs = listProfileDirs(userData);
  const includeSubs = cfg.includeHostSubstrings || [];

  const profiles = [];
  let masterCandidates = [];

  for (const dir of profileDirs) {
    const bmPath = path.join(userData, dir, "Bookmarks");
    const info = infoCache[dir] || {};
    const displayName = info.name || info.shortcut_name || info.gaia_name || "";
    const userName = info.user_name || "";
    const managed = isManagedProfile(userData, dir);
    const raw = readJsonSafe(bmPath);
    const flat = [];
    if (raw?.roots) {
      for (const rootKey of Object.keys(raw.roots)) {
        walkBookmarks(raw.roots[rootKey], dir, flat);
      }
    }
    const matched = flat.filter((x) => urlMatchesInclude(x.url, includeSubs));
    const lowerDisplay = `${displayName} ${userName}`.toLowerCase();
    const isMasterGuess = masterMatchers.some((m) => lowerDisplay.includes(m));

    profiles.push({
      directory: dir,
      displayName: displayName || "(unnamed)",
      userName,
      bookmarkFileBytes: fs.statSync(bmPath).size,
      totalUrlsSampled: flat.length,
      matchedImportantUrls: matched.length,
      managedPreferencesFile: managed,
      heuristicWorkspaceManaged: managed,
      masterNameMatch: isMasterGuess,
    });

    if (isMasterGuess) masterCandidates.push(dir);
  }

  /** Dedupe by normalized URL; keep longest title */
  const byUrl = new Map();
  for (const dir of profileDirs) {
    const bmPath = path.join(userData, dir, "Bookmarks");
    const raw = readJsonSafe(bmPath);
    const flat = [];
    if (raw?.roots) {
      for (const rootKey of Object.keys(raw.roots)) {
        walkBookmarks(raw.roots[rootKey], dir, flat);
      }
    }
    for (const x of flat) {
      if (!urlMatchesInclude(x.url, includeSubs)) continue;
      const key = normalizeUrl(x.url);
      const prev = byUrl.get(key);
      const title = x.name || x.url;
      if (!prev || (title && title.length > (prev.name || "").length)) {
        byUrl.set(key, { url: x.url, name: title, sources: [...(prev?.sources || []), dir] });
      } else {
        prev.sources = [...new Set([...prev.sources, dir])];
      }
    }
  }

  const merged = [...byUrl.values()].map(({ url, name, sources }) => ({
    url,
    name,
    mergedFromProfiles: sources,
  }));

  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const reportDir = path.join(root, "windows-heal", "reports");
  fs.mkdirSync(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, `chrome-bookmark-consolidation-${stamp}.json`);
  const htmlPath = path.join(reportDir, `chrome-merged-bookmarks-import-${stamp}.html`);

  const report = {
    generatedAt: new Date().toISOString(),
    chromeUserData: userData,
    localStatePresent: fs.existsSync(localStatePath),
    masterProfileDisplayNameMatch: cfg.masterProfileDisplayNameMatch,
    masterProfileCandidates: masterCandidates,
    masterProfileAmbiguous: masterCandidates.length > 1,
    cursorFavoriteChatsNote:
      "Cursor pinned/favorite chats are stored under Cursor app data, not Chrome Bookmarks. Open Cursor → chat history / favorites and re-pin there.",
    profiles,
    mergedBookmarkCount: merged.length,
    mergedBookmarksPreview: merged.slice(0, 80),
    importInstructions: [
      "1. Prefer quitting Chrome completely before importing.",
      `2. Open Chrome as the ${masterNameArg} (master) profile only.`,
      "3. Chrome menu → Bookmarks and lists → Bookmark manager → ⋮ Organize → Import bookmarks → choose the generated HTML file.",
      "4. Drag imported folder onto Bookmarks bar if desired.",
      "5. Do NOT use this tool to copy Cookies/Login Data — not supported by design.",
    ],
    workspaceIsolationNote:
      "Keep work profiles for business-only: do not sign personal master into managed accounts; use separate Chrome profile shortcuts from chrome://settings/manageProfile.",
  };

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
  fs.writeFileSync(
    htmlPath,
    toNetscapeHtml(
      merged.map((m) => ({ url: m.url, name: `${m.name} [${m.mergedFromProfiles.join(", ")}]` })),
      "BossMind merged bookmarks (deduped)"
    ),
    "utf8"
  );

  if (hasFlag("backup-bookmarks")) {
    const backupRoot = path.join(root, "windows-heal", "chrome-bookmark-backups", stamp);
    fs.mkdirSync(backupRoot, { recursive: true });
    for (const dir of profileDirs) {
      const src = path.join(userData, dir, "Bookmarks");
      const dest = path.join(backupRoot, `${dir.replace(/[^\w.-]+/g, "_")}-Bookmarks.bak`);
      fs.copyFileSync(src, dest);
    }
    report.bookmarkFileBackupsDir = backupRoot;
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
  }

  console.log(JSON.stringify({ ok: true, reportPath, htmlPath, mergedBookmarkCount: merged.length, masterCandidates }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
