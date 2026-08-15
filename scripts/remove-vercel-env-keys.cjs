/**
 * Remove Vercel infrastructure keys from env files (key names only logged).
 * Does not print secret values.
 */
const fs = require("fs");

const files = [
  "d:/BossMind/bossmind-resumora/.env.local",
  "d:/BossMind/bossmind-resumora/functions/.env",
  "d:/BossMind/bossmind-resumora/.env",
  "d:/BossMind/resumora-clean/.env.local",
  "d:/BossMind/resumora-clean/.env",
];

const vercelKey = /^\s*[A-Za-z0-9_]*VERCEL[A-Za-z0-9_]*\s*=/;

for (const file of files) {
  if (!fs.existsSync(file)) {
    console.log("skip", file);
    continue;
  }
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  const removed = [];
  const kept = lines.filter((line) => {
    if (vercelKey.test(line)) {
      const key = line.split("=")[0].trim();
      removed.push(key);
      return false;
    }
    return true;
  });
  if (removed.length) {
    fs.writeFileSync(file, kept.join("\n"));
    console.log("removed", removed.join(", "), "from", file);
  } else {
    console.log("clean", file);
  }
}
