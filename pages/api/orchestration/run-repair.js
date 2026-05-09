const { runRepairFlow } = require("../../../lib/orchestration/langgraph-repair-flow");
const {
  initializeSharedMemory,
  saveEvent,
} = require("../../../lib/shared/neon-memory");

const PROJECT_KEY = process.env.BOSSMIND_PROJECT_KEY || "resumora";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const init = await initializeSharedMemory();
  if (!init.enabled) {
    return res.status(503).json({
      error: "Shared memory is not enabled",
      details: init.reason,
    });
  }

  const sentryEvent = req.body?.sentryEvent || {
    eventId: `manual-${Date.now()}`,
    errorType: "manual_trigger",
    errorMessage: "Repair flow triggered manually",
    stack: "",
  };

  try {
    const result = await runRepairFlow({
      projectKey: PROJECT_KEY,
      sentryEvent,
      validationResult: req.body?.validationResult || { ok: false },
      deployResult: req.body?.deployResult || { ok: false },
    });
    return res.status(200).json({ ok: true, result });
  } catch (error) {
    await saveEvent({
      projectKey: PROJECT_KEY,
      eventType: "repair.flow.failed",
      severity: "error",
      source: "api.run-repair",
      payload: { message: error.message },
    });
    return res.status(500).json({ error: error.message || "Repair flow failed" });
  }
}
