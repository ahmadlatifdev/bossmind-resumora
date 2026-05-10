#!/usr/bin/env node
/**
 * Restore a file from Neon rollback_snapshots (latest match or --id=).
 * Usage: node scripts/bossmind-restore-rollback.mjs --file=components/foo.jsx [--write] [--id=123]
 */
import { writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const neon = require("../lib/shared/neon-memory");
const PROJECT_KEY = process.env.BOSSMIND_PROJECT_KEY || "resumora";

function arg(name) {
  const p = process.argv.find((a) => a.startsWith(`--${name}=`));
  return p ? p.slice(name.length + 3) : null;
}

async function main() {
  const id = arg("id");
  const fileNeedle = arg("file");
  const write = process.argv.includes("--write");

  const init = await neon.initializeSharedMemory();
  if (!init.enabled) {
    console.error("Neon not configured — cannot load rollback body.");
    process.exit(1);
  }

  let row;
  if (id) {
    row = await neon.getRollbackSnapshotById({
      projectKey: PROJECT_KEY,
      snapshotId: Number.parseInt(id, 10),
    });
  } else if (fileNeedle) {
    const like = `%${fileNeedle.replace(/%/g, "")}%`;
    const rows = await neon.listLatestRollbackSnapshots({
      projectKey: PROJECT_KEY,
      limit: 1,
      pathLike: like,
    });
    row = rows[0];
  } else {
    console.error("Provide --file=substring or --id=snapshot_id");
    process.exit(2);
  }

  if (!row) {
    console.error("No rollback snapshot found.");
    process.exit(3);
  }

  const target = row.file_path || (fileNeedle ? join(root, fileNeedle) : null);
  if (!target) {
    console.error("Cannot determine restore path.");
    process.exit(4);
  }
  console.log("Selected snapshot:", {
    id: row.id,
    file_path: row.file_path,
    snapshot_hash: row.snapshot_hash,
    created_at: row.created_at,
    writeTarget: target,
  });

  if (!write) {
    console.log("Dry run — pass --write to restore file body to disk.");
    process.exit(0);
  }

  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, row.snapshot_body, "utf8");
  console.log("Restored:", target);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
