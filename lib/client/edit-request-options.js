/** Resume length options for included free edits (all paid plans). */

const RESUME_LENGTH_VALUES = new Set(["standard", "2_pages"]);

function normalizeResumeLength(value) {
  const v = String(value || "").trim().toLowerCase();
  if (v === "2_pages" || v === "2-page" || v === "2page") return "2_pages";
  return "standard";
}

function resumeLengthFromMetadata(metadata) {
  if (!metadata) return "standard";
  const meta = typeof metadata === "string" ? safeParseJson(metadata) : metadata;
  return normalizeResumeLength(meta?.resumeLength);
}

function safeParseJson(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function buildEditRequestMetadata(resumeLength) {
  return { resumeLength: normalizeResumeLength(resumeLength) };
}

module.exports = {
  RESUME_LENGTH_VALUES,
  normalizeResumeLength,
  resumeLengthFromMetadata,
  buildEditRequestMetadata,
};
