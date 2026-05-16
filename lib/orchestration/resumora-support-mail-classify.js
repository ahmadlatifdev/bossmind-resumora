/**
 * Heuristic support-mail routing (no external LLM; n8n may override with DeepSeek/OpenAI).
 */
const fs = require("node:fs");
const path = require("node:path");

const URGENT = /\b(urgent|asap|immediately|emergency|lawsuit|legal\s+action|deadline\s+today)\b/i;

function loadArchitecture(repoRoot) {
  const p = path.join(repoRoot, "config", "resumora-ai-support-mail-architecture.json");
  const raw = fs.readFileSync(p, "utf8");
  return JSON.parse(raw);
}

function classifySupportIntake(repoRoot, { subject = "", body = "", hasAttachment = false } = {}) {
  const text = `${subject}\n${body}`.toLowerCase();
  const arch = loadArchitecture(repoRoot);
  const routes = Array.isArray(arch.routing) ? arch.routing : [];
  const urgent = URGENT.test(text);
  const tags = [];

  if (hasAttachment) tags.push("has_attachment");
  if (/\b(cv|resume|curriculum vitae|c\.v\.)\b/i.test(text)) tags.push("resume_cv_mention");
  if (urgent) tags.push("urgent_keyword");

  /** @type {string[]} */
  const order = [
    "refund_legal_payment",
    "spam",
    "vip",
    "interview_coaching",
    "resume_status",
    "resume_cv",
    "pricing",
  ];
  const byId = new Map(routes.map((r) => [r.id, r]));

  for (const id of order) {
    const r = byId.get(id);
    if (!r || !Array.isArray(r.matchHints)) continue;
    if (r.matchHints.length === 0) continue;
    const hit = r.matchHints.some((h) => text.includes(String(h).toLowerCase()));
    if (hit) {
      return {
        routeId: r.id,
        priority: urgent || r.id === "refund_legal_payment" ? "high" : "normal",
        urgent,
        suggestedLabels: [r.gmailLabel || `Resumora/${r.id}`].filter(Boolean),
        templateRef: r.templateRef || null,
        autoSendAllowed: Boolean(r.autoSendAllowed),
        humanReviewRequired: Boolean(r.humanReviewRequired),
        engine: "heuristic_v1",
        tags,
      };
    }
  }

  if (hasAttachment && /\bresume\b/i.test(subject + body)) {
    const r = byId.get("resume_cv");
    if (r) {
      return {
        routeId: "resume_cv",
        priority: urgent ? "high" : "normal",
        urgent,
        suggestedLabels: [r.gmailLabel || "Resumora/Resume-CV"],
        templateRef: r.templateRef || null,
        autoSendAllowed: Boolean(r.autoSendAllowed),
        humanReviewRequired: Boolean(r.humanReviewRequired),
        engine: "heuristic_v1",
        tags: [...tags, "attachment_resume_keyword"],
      };
    }
  }

  if (/\b(cv|curriculum vitae|c\.v\.)\b/i.test(text)) {
    const r = byId.get("resume_cv");
    if (r) {
      return {
        routeId: "resume_cv",
        priority: urgent ? "high" : "normal",
        urgent,
        suggestedLabels: [r.gmailLabel || "Resumora/Resume-CV"],
        templateRef: r.templateRef || null,
        autoSendAllowed: Boolean(r.autoSendAllowed),
        humanReviewRequired: Boolean(r.humanReviewRequired),
        engine: "heuristic_v1",
        tags,
      };
    }
  }

  if (hasAttachment && /\b(pdf|doc|docx)\b/i.test(text)) {
    tags.push("likely_document");
  }

  return {
    routeId: "general_intake",
    priority: urgent ? "high" : "normal",
    urgent,
    suggestedLabels: ["Resumora/General"],
    templateRef: null,
    autoSendAllowed: false,
    humanReviewRequired: true,
    engine: "heuristic_v1",
    tags,
  };
}

module.exports = { classifySupportIntake, loadArchitecture };
