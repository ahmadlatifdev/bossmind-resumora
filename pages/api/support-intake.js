const { saveEvent } = require("../../lib/shared/neon-memory");

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  let body = {};
  try {
    body = typeof req.body === "object" && req.body ? req.body : JSON.parse(req.body || "{}");
  } catch {
    return res.status(400).json({ error: "Invalid JSON" });
  }

  const email = typeof body.email === "string" ? body.email.trim().slice(0, 320) : "";
  const message = typeof body.message === "string" ? body.message.trim().slice(0, 8000) : "";

  if (!email || !message) {
    return res.status(400).json({ error: "Email and message required" });
  }

  try {
    await saveEvent({
      projectKey: "resumora",
      eventType: "support_chat_intake",
      severity: "info",
      source: "chat_page",
      payload: {
        emailLen: email.length,
        messageLen: message.length,
        lang: body.lang === "fr" ? "fr" : "en",
      },
    });
  } catch {
    /* optional neon */
  }

  return res.status(200).json({ ok: true, automated: true });
}
