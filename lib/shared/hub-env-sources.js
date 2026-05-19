/**
 * Canonical BossMind hub .env source paths (D:\BossMind only — never archives).
 * Used by deploy scripts; does not log secret values.
 */
const path = require("path");

const HUB_ROOT = process.env.BOSSMIND_HUB_ROOT || "D:/BossMind";

const HUB_ENV_SOURCES = [
  path.join(HUB_ROOT, "bossmind-resumora/.env"),
  path.join(HUB_ROOT, "bossmind-resumora/.env.local"),
  path.join(HUB_ROOT, "bossmind-shared/.env"),
  path.join(HUB_ROOT, "bossmind-shared/.env.master"),
  path.join(HUB_ROOT, "bossmind-shared/Global-files/.env"),
  path.join(HUB_ROOT, "bossmind-shared/Global-files/.env.master"),
  path.join(HUB_ROOT, "bossmind-shared/automation/.env"),
  path.join(HUB_ROOT, "bossmind-shared/automation/.env.core"),
  path.join(HUB_ROOT, "bossmind-shared/automation/.env.master"),
  path.join(HUB_ROOT, "16-neon/.env"),
  path.join(HUB_ROOT, "16-neon/.env.bossmind"),
];

module.exports = { HUB_ROOT, HUB_ENV_SOURCES };
