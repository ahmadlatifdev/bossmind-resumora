/**
 * Client helper: verify resume parse drafts (local + optional server log).
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
 * Local verification mirroring functions/resumeVerify.js
 */
export function verifyResumeParsing(parsed) {
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
    normalized: { ...data, fullName, email, phone, rawText, skills: skillsList },
  };
}

export const RESUME_PARSE_ERROR_KEY = 'resume.parseError';

/**
 * POST /api/resume/verify-parse — records failed_parses on server when invalid.
 */
export async function verifyResumeParseRemote(parsed, { fileName, source, idToken } = {}) {
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  if (idToken) headers.Authorization = `Bearer ${idToken}`;
  const res = await fetch('/api/resume/verify-parse', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      parsed,
      fileName,
      source,
    }),
  });
  const data = await res.json().catch(() => ({}));
  return { httpStatus: res.status, ...data };
}
