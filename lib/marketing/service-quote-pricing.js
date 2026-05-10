/** Indicative USD scope — Stripe still charges the tier Price ID; extras go to session metadata. */

/** One-time tier list prices (USD) — must stay aligned with Pricing UI (`site-copy.js` pricingPlans). */
export const BASIC_PRICE_USD = 19;
export const PRO_PRICE_USD = 49;
export const ELITE_PRICE_USD = 99;

const TIER_BASE_USD = {
  basic: BASIC_PRICE_USD,
  professional: PRO_PRICE_USD,
  elite: ELITE_PRICE_USD,
};

const EXTRA_PAGE_USD = 12;
const RESUME_TYPE_DELTA = {
  chronological: 0,
  hybrid: 5,
  executive: 15,
};
const LANGUAGE_DELTA = {
  en: 0,
  fr: 0,
  bilingual: 25,
};
const ADDON_USD = {
  strategicLetter: 25,
  linkedinSprint: 35,
  interviewPack: 40,
};
const DELIVERY_DELTA = {
  standard: 0,
  expedited: 30,
  rush: 60,
};

export const DEFAULT_SERVICE_CONFIG = {
  tier: "professional",
  pageCount: 2,
  resumeType: "hybrid",
  languageMode: "bilingual",
  addons: {
    strategicLetter: false,
    linkedinSprint: false,
    interviewPack: false,
  },
  delivery: "standard",
};

export const QUOTE_STORAGE_KEY = "rs_service_quote_v1";

export function mergeServiceConfig(partial) {
  return {
    ...DEFAULT_SERVICE_CONFIG,
    ...partial,
    addons: { ...DEFAULT_SERVICE_CONFIG.addons, ...(partial?.addons || {}) },
  };
}

/**
 * @param {typeof DEFAULT_SERVICE_CONFIG & { serviceKey?: string }} config
 */
export function computeServiceQuote(config) {
  const tier = config.tier in TIER_BASE_USD ? config.tier : "professional";
  const base = TIER_BASE_USD[tier];
  const lines = [];

  lines.push({ key: "tier", labelKey: "svcQuoteLineTierBase", amount: base, meta: tier });

  const includedPages = tier === "elite" ? 3 : tier === "professional" ? 2 : 1;
  const extraPages = Math.max(0, Number(config.pageCount) - includedPages);
  if (extraPages > 0) {
    const amt = extraPages * EXTRA_PAGE_USD;
    lines.push({ key: "pages", labelKey: "svcQuoteLineExtraPages", amount: amt, meta: extraPages });
  }

  const rt = RESUME_TYPE_DELTA[config.resumeType] ?? 0;
  if (rt > 0) {
    lines.push({ key: "resumeType", labelKey: "svcQuoteLineResumeType", amount: rt, meta: config.resumeType });
  }

  const langExtra = LANGUAGE_DELTA[config.languageMode] ?? 0;
  if (langExtra > 0) {
    lines.push({ key: "language", labelKey: "svcQuoteLineLanguage", amount: langExtra, meta: config.languageMode });
  }

  for (const [k, on] of Object.entries(config.addons || {})) {
    if (on && ADDON_USD[k]) {
      lines.push({ key: `addon_${k}`, labelKey: `svcQuoteAddon_${k}`, amount: ADDON_USD[k], meta: k });
    }
  }

  const del = DELIVERY_DELTA[config.delivery] ?? 0;
  if (del > 0) {
    lines.push({ key: "delivery", labelKey: "svcQuoteLineDelivery", amount: del, meta: config.delivery });
  }

  const adjustmentsTotal = lines.slice(1).reduce((s, l) => s + l.amount, 0);
  const indicativeTotal = lines.reduce((s, l) => s + l.amount, 0);

  return {
    tier,
    baseUsd: base,
    lines,
    adjustmentsTotal,
    indicativeTotal,
    stripePlanId: tier,
  };
}

export function compactQuoteForMetadata({ serviceKey, lang, config, quote }) {
  const payload = {
    svc: serviceKey,
    l: lang,
    t: quote.tier,
    p: config.pageCount,
    r: config.resumeType,
    m: config.languageMode,
    d: config.delivery,
    a: Object.entries(config.addons || {})
      .filter(([, v]) => v)
      .map(([k]) => k),
    est: quote.indicativeTotal,
  };
  const s = JSON.stringify(payload);
  return s.length > 480 ? s.slice(0, 477) + "..." : s;
}
