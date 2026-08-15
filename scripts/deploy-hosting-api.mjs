/**
 * Deploy dist/ to Firebase Hosting via REST API using a gcloud access token.
 * Used when firebase CLI has no login session.
 */
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const PROJECT = "resumora-live";
const SITE = "client-resumora-live";
const PUBLIC_DIR = path.resolve("dist");
const API = "https://firebasehosting.googleapis.com/v1beta1";

function token() {
  const fromEnv = (process.env.GCLOUD_ACCESS_TOKEN || "").trim();
  if (fromEnv) return fromEnv;
  const bin = process.platform === "win32" ? "gcloud.cmd" : "gcloud";
  const raw = execFileSync(bin, ["auth", "print-access-token"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    shell: process.platform === "win32",
  }).trim();
  if (!raw) throw new Error("empty gcloud access token");
  return raw;
}

async function api(tok, method, url, body) {
  const headers = {
    Authorization: `Bearer ${tok}`,
    "x-goog-user-project": PROJECT,
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`${method} ${url} -> ${res.status} non-json: ${text.slice(0, 300)}`);
  }
  if (!res.ok) {
    throw new Error(`${method} ${url} -> ${res.status} ${text.slice(0, 800)}`);
  }
  return json;
}

function walk(dir, base = dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name.startsWith(".")) continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(full, base, out);
    else out.push(full);
  }
  return out;
}

function toPosix(p) {
  return "/" + p.split(path.sep).join("/");
}

const tok = token();
console.log("auth=gcloud-access-token");
console.log(`project=${PROJECT} site=${SITE}`);

if (!fs.existsSync(path.join(PUBLIC_DIR, "index.html"))) {
  throw new Error("dist/index.html missing");
}

const releases = await api(
  tok,
  "GET",
  `${API}/projects/${PROJECT}/sites/${SITE}/releases?pageSize=1`,
);
const prevConfig = releases?.releases?.[0]?.version?.config || null;
console.log(`previousRelease=${releases?.releases?.[0]?.name || "none"}`);

const firebaseJson = JSON.parse(fs.readFileSync(path.resolve("firebase.json"), "utf8"));
const rewrites = (firebaseJson.hosting?.rewrites || []).map((r) => {
  const out = { glob: r.source };
  if (r.destination) out.path = r.destination;
  if (r.function) out.function = r.function;
  return out;
});
const config = { ...(prevConfig || {}), rewrites };
const createBody = { config };
const version = await api(
  tok,
  "POST",
  `${API}/projects/${PROJECT}/sites/${SITE}/versions`,
  createBody,
);
console.log(`version=${version.name} status=${version.status}`);

const files = {};
const gzipByHash = new Map();
for (const full of walk(PUBLIC_DIR)) {
  const rel = toPosix(path.relative(PUBLIC_DIR, full));
  const gzipped = zlib.gzipSync(fs.readFileSync(full));
  const hash = crypto.createHash("sha256").update(gzipped).digest("hex");
  files[rel] = hash;
  gzipByHash.set(hash, gzipped);
}
console.log(`fileCount=${Object.keys(files).length}`);

const populated = await api(
  tok,
  "POST",
  `https://firebasehosting.googleapis.com/v1beta1/${version.name}:populateFiles`,
  { files },
);
const needed = populated.uploadRequiredHashes || [];
const uploadUrl = populated.uploadUrl;
console.log(`uploadsRequired=${needed.length}`);

for (const hash of needed) {
  const buf = gzipByHash.get(hash);
  if (!buf) throw new Error(`missing gzip for hash ${hash.slice(0, 12)}`);
  const res = await fetch(`${uploadUrl}/${hash}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${tok}`,
      "x-goog-user-project": PROJECT,
      "Content-Type": "application/octet-stream",
    },
    body: buf,
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`upload ${hash.slice(0, 12)} -> ${res.status} ${t.slice(0, 300)}`);
  }
}
console.log("uploads=ok");

const finalized = await api(tok, "PATCH", `${API}/${version.name}?updateMask=status`, {
  status: "FINALIZED",
});
console.log(`finalized=${finalized.status}`);

const versionName = encodeURIComponent(version.name);
const release = await api(
  tok,
  "POST",
  `${API}/projects/${PROJECT}/sites/${SITE}/releases?versionName=${versionName}`,
  {},
);
console.log(`release=${release.name}`);
console.log("HOSTING_URL=https://client-resumora-live.web.app");
console.log("DEPLOY_OK");
