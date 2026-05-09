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
  const lang = body.lang === "fr" ? "fr" : "en";

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
        lang,
      },
    });
  } catch {
    /* optional neon */
  }

  return res.status(200).json({
    ok: true,
    automated: true,
    confirmation:
      lang === "fr"
        ? "Accusé de réception automatisé — configurez la réponse serveur pour support@resumora.net."
        : "Automated acknowledgment flow — configure mail-server auto-reply for support@resumora.net.",
  });
}
