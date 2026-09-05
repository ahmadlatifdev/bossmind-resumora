/**
 * Map FR/ES (and common codes) to English for Master Admin display only.
 * Client-facing i18n is unchanged.
 */
const PHRASE_MAP = Object.freeze({
  abonnement: 'Subscription',
  subscription: 'Subscription',
  suscripción: 'Subscription',
  suscripcion: 'Subscription',
  activé: 'Active',
  active: 'Active',
  activado: 'Active',
  désactivé: 'Inactive',
  desactive: 'Inactive',
  desactivado: 'Inactive',
  inactive: 'Inactive',
  paused: 'Paused',
  en_pause: 'Paused',
  'en pause': 'Paused',
  pausado: 'Paused',
  pending: 'Pending',
  en_attente: 'Pending',
  'en attente': 'Pending',
  pendiente: 'Pending',
  approved: 'Approved',
  approuvé: 'Approved',
  aprobado: 'Approved',
  rejected: 'Rejected',
  rejeté: 'Rejected',
  rechazado: 'Rejected',
  refund: 'Refund',
  remboursement: 'Refund',
  reembolso: 'Refund',
  basic: 'Basic',
  basique: 'Basic',
  básico: 'Basic',
  basico: 'Basic',
  balanced: 'Balanced',
  équilibré: 'Balanced',
  equilibrado: 'Balanced',
  professional: 'Professional',
  professionnel: 'Professional',
  profesional: 'Professional',
  advanced: 'Advanced',
  avancé: 'Advanced',
  avanzado: 'Advanced',
  pro: 'Professional',
  building: 'Building',
  en_construction: 'Building',
  failed: 'Failed',
  échec: 'Failed',
  fallido: 'Failed',
});

const CODE_MAP = Object.freeze({
  BASIC: 'Basic',
  BALANCED: 'Balanced',
  PROFESSIONAL: 'Professional',
  PRO: 'Professional',
  ADVANCED: 'Advanced',
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
  PAUSED: 'Paused',
  PENDING: 'Pending',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
});

function normalizeKey(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * @param {unknown} value
 * @returns {string}
 */
export function toAdminEnglish(value) {
  if (value == null) return '';
  const raw = String(value).trim();
  if (!raw) return '';
  const upper = raw.toUpperCase();
  if (CODE_MAP[upper]) return CODE_MAP[upper];
  const key = normalizeKey(raw);
  if (PHRASE_MAP[key]) return PHRASE_MAP[key];
  // Title-case unknown short codes
  if (/^[A-Z0-9_]{2,20}$/.test(raw)) {
    return raw
      .split('_')
      .map((p) => p.charAt(0) + p.slice(1).toLowerCase())
      .join(' ');
  }
  return raw;
}

export function mapAdminStatus(value) {
  return toAdminEnglish(value);
}

export function mapAdminPlan(value) {
  return toAdminEnglish(value);
}
