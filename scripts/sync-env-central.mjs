import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const VAULT = path.join("D:", "BossMind", "config", "secrets.env");
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dest = path.join(projectRoot, ".env.central");

if (!fs.existsSync(VAULT)) {
  console.error(`[sync-env-central] vault missing: ${VAULT}`);
  console.error("Run: node D:\\BossMind\\resumora-luxury\\scripts\\bootstrap-central-secrets.mjs");
  process.exit(1);
}

fs.copyFileSync(VAULT, dest);
console.log(`[sync-env-central] copied vault → ${dest}`);
