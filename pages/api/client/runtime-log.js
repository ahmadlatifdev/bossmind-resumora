require("../../../lib/shared/ensure-project-env");
const { saveEvent } = require("../../../lib/shared/neon-memory");

const PROJECT_KEY = () => process.env.BOSSMIND_PROJECT_KEY || "resumora";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { event, detail, path, at } = req.body || {};
  const payload = {
    event: String(event || "unknown").slice(0, 80),
    detail: detail && typeof detail === "object" ? detail : {},
    path: String(path || "").slice(0, 500),
    at: at || new Date().toISOString(),
  };

  const severity =
    String(event || "").includes("error") || String(event || "").includes("blocked")
      ? "warn"
      : "info";

  console.info("[runtime-log]", payload.event, payload.path, payload.detail);

  try {
    await saveEvent({
      projectKey: PROJECT_KEY(),
      eventType: `checkout_runtime.${payload.event}`,
      severity,
      source: "checkout-runtime",
      eventKey: `runtime:${payload.event}:${Date.now()}`,
      payload,
    });
  } catch {
    /* non-blocking */
  }

  return res.status(204).end();
}
