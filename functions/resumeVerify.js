/**
 * Resume parse verification layer.
 * Validates structured drafts and records failures in Firestore `failed_parses`.
 * Never logs PII beyond field presence flags.
 */

const EMAIL_RE = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;

function asSkillsList(skills) {
  if (Array.isArray(skills)) {
    return skills.map((s) => String(s || '').trim()).filter(Boolean);
  }
  return String(skills || '')
    .split(/[,;|]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * @param {object} parsed
 * @returns {{ ok: boolean, errors: string[], normalized: object }}
 */
function verifyResumeParsing(parsed) {
  const data = parsed && typeof parsed === 'object' ? parsed : {};
  const fullName = String(data.fullName || data.name || '').trim();
  const email = String(data.email || '').trim();
  const phone = String(data.phone || '').trim();
  const rawText = String(data.rawText || data.raw || '').trim();
  const skillsList = asSkillsList(data.skills);

  const errors = [];
  if (!fullName) errors.push('fullName_empty');
  if (!email) errors.push('email_empty');
  else if (!EMAIL_RE.test(email)) errors.push('email_invalid');
  if (!phone) errors.push('phone_empty');
  if (!skillsList.length) errors.push('skills_empty');
  if (!rawText) errors.push('rawText_empty');

  return {
    ok: errors.length === 0,
    errors,
    normalized: {
      ...data,
      fullName,
      email,
      phone,
      rawText,
      skills: skillsList,
    },
  };
}

/**
 * Persist a failed parse for ops review (no full resume body beyond short snippet).
 */
async function recordFailedParse(db, { fileName, errors, source, uid, rawTextLength }) {
  if (!db) return null;
  const ref = await db.collection('failed_parses').add({
    fileName: String(fileName || 'unknown').slice(0, 240),
    errorReason: Array.isArray(errors) ? errors.join(',') : String(errors || 'unknown'),
    errors: Array.isArray(errors) ? errors : [String(errors || 'unknown')],
    source: String(source || 'unknown').slice(0, 64),
    uid: uid ? String(uid).slice(0, 128) : null,
    rawTextLength: Number(rawTextLength) || 0,
    createdAt: new Date().toISOString(),
  });
  return ref.id;
}

const CLIENT_ERROR_PAYLOAD = {
  status: 'error',
  message: "We couldn't fully read your resume. Please check your file or upload a PDF/DOCX.",
  code: 'RESUME_PARSE_VERIFY_FAILED',
};

module.exports = {
  verifyResumeParsing,
  recordFailedParse,
  CLIENT_ERROR_PAYLOAD,
  EMAIL_RE,
};
