/**
 * Canonical BossMind hub .env source paths (D:\BossMind only — never archives).
 * Used by deploy scripts; does not log secret values.
 */
const path = require("path");

const HUB_ROOT = process.env.BOSSMIND_HUB_ROOT || "D:/BossMind";

/** @type {string[]} Local-only vaults first; tracked templates must stay empty. */
const HUB_ENV_SOURCES = [
  path.join(HUB_ROOT, "bossmind-shared/automation/.env.master.local"),
  path.join(HUB_ROOT, "bossmind-shared/.env.master.local"),
  path.join(HUB_ROOT, "bossmind-shared/Global-files/.env.master.local"),
  path.join(HUB_ROOT, "16-neon/.env.bossmind.local"),
  path.join(HUB_ROOT, "bossmind-resumora/.env.local"),
  path.join(HUB_ROOT, "bossmind-resumora/.env"),
  path.join(HUB_ROOT, "bossmind-shared/.env"),
  path.join(HUB_ROOT, "bossmind-shared/Global-files/.env"),
  path.join(HUB_ROOT, "bossmind-shared/automation/.env"),
  path.join(HUB_ROOT, "16-neon/.env"),
];

module.exports = { HUB_ROOT, HUB_ENV_SOURCES };
