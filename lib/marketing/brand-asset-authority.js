/**
 * Global Brand Asset Authority — single locked Resumora logo source (Node).
 * UI must import ResumoraLogo from @/components/brand/ResumoraLogo.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const constants = require("./brand-asset-authority.constants");

function readLockedLogoHash(cwd = process.cwd()) {
  const filePath = path.join(cwd, constants.BRAND_LOGO_PUBLIC_FILE);
  if (!fs.existsSync(filePath)) return null;
  const buf = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(buf).digest("hex");
}

module.exports = {
  ...constants,
  readLockedLogoHash,
};
