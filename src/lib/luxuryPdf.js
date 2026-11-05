/**
 * Luxury PDF download (browser → Resumora Cloud Functions).
 * Auth + subscription-gated signed URL endpoint.
 */
import { auth } from './firebase';

export const LUXURY_PDFS = Object.freeze([
  { fileName: 'luxury-resume-templates.pdf', label: 'Luxury Resume Templates' },
  { fileName: 'luxury-cover-letter-guide.pdf', label: 'Luxury Cover Letter Guide' },
  { fileName: 'luxury-career-guide.pdf', label: 'Luxury Career Guide' },
]);

/** Returns a signed download URL for a private luxury PDF (throws on auth/403/404). */
export async function fetchLuxuryPdfUrl(fileName) {
  let token = '';
  try {
    token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
  } catch {
    token = '';
  }
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch('/api/luxury-pdf-url', {
    method: 'POST',
    headers,
    body: JSON.stringify({ fileName }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Luxury PDF failed (${res.status})`);
  }
  return data;
}
