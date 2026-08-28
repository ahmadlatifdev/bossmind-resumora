import en from '../../locales/en.json';
import fr from '../../locales/fr.json';
import es from '../../locales/es.json';

const LANG_KEY = 'resumora_lang';
const SUPPORTED = Object.freeze(['en', 'fr', 'es']);
const DICTS = Object.freeze({ en, fr, es });

export function normalizeLang(lang) {
  const raw = String(lang || '')
    .toLowerCase()
    .slice(0, 2);
  return SUPPORTED.includes(raw) ? raw : 'en';
}

export function getLang() {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (SUPPORTED.includes(saved)) return saved;
  } catch (_) {
    /* ignore */
  }
  const nav = (navigator.language || 'en').toLowerCase();
  if (nav.startsWith('fr')) return 'fr';
  if (nav.startsWith('es')) return 'es';
  return 'en';
}

export function setLang(lang) {
  const next = normalizeLang(lang);
  try {
    localStorage.setItem(LANG_KEY, next);
  } catch (_) {
    /* ignore */
  }
  try {
    document.documentElement.lang = next;
  } catch (_) {
    /* ignore */
  }
  return next;
}

export function t(lang, key) {
  const code = normalizeLang(lang);
  const fromLang = DICTS[code]?.[key];
  // Placeholder convention: FR/ES may store the key name until a human translation is provided.
  if (fromLang && fromLang !== key) return fromLang;
  const fromEn = DICTS.en?.[key];
  if (fromEn && fromEn !== key) return fromEn;
  return key;
}

export { SUPPORTED as LANGS };
