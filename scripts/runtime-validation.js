const fs = require("fs");
const path = require("path");
const { loadProjectEnv } = require("../lib/shared/load-project-env");
const { auditStripeEnv, describeStripeBlockers } = require("../lib/marketing/stripe-env-audit");

loadProjectEnv();

const ollama = require("ollama");
const {
  getSqlClient,
  initializeSharedMemory,
} = require("../lib/shared/neon-memory");
const { listScreenshotFiles } = require("../lib/shared/screenshot-indexer");

async function main() {
  const referenceFolder =
    process.env.BOSSMIND_REFERENCE_IMAGES_FOLDER ||
    "D:\\Shakhsy11\\bossmind-resumora-base\\reference-images";

  const hasLogo = fs.existsSync(path.join(process.cwd(), "public", "resumora-logo.png"));
  if (!hasLogo) {
    throw new Error("Missing public/resumora-logo.png");
  }

  const screenshotCount = listScreenshotFiles(referenceFolder).length;
  console.log(`Screenshot references found: ${screenshotCount}`);

  const memory = await initializeSharedMemory();
  if (!memory.enabled) {
    console.warn(`Shared memory disabled: ${memory.reason}`);
  } else {
    const sql = getSqlClient();
    const row = await sql("SELECT NOW() AS now");
    console.log(`Neon connectivity OK at ${row[0].now}`);
  }

  const modelConfigured = !!process.env.OLLAMA_MODEL;
  if (modelConfigured) {
    console.log(`Ollama model configured: ${process.env.OLLAMA_MODEL}`);
  } else {
    console.log("Ollama package available. Set OLLAMA_MODEL for active model routing.");
  }

  const stripeAudit = auditStripeEnv();
  console.log(
    `Stripe checkoutReady=${stripeAudit.checkoutReady} (see npm run validate:stripe)`
  );
  if (!stripeAudit.checkoutReady && stripeAudit.secretKey.present) {
    console.warn(describeStripeBlockers(stripeAudit).slice(0, 5).join(" | "));
  }

  // Smoke check API shape only (no mandatory daemon requirement).
  const hasChatFunction =
    typeof ollama.chat === "function" ||
    typeof ollama.default?.chat === "function";
  if (!hasChatFunction) {
    throw new Error("Ollama client is not available.");
  }
}

main().catch((error) => {
  console.error(`Runtime validation failed: ${error.message}`);
  process.exit(1);
});
