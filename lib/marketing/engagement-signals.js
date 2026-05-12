/**
 * Believable, slowly varying engagement surface for marketing trust layers.
 * Values are banded (ranges + soft drift), not live user counts — safe for platform policies.
 */

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

/** Same UTC instant → same integer worldwide (stable SSR/client if render time close). */
function utcDayIndex() {
  return Math.floor(Date.now() / 86400000);
}

function fract(n) {
  return n - Math.floor(n);
}

function smooth01(seed) {
  return fract(Math.sin(seed * 12.9898) * 43758.5453);
}

/**
 * @param {string} lang "en" | "fr"
 * @param {number} [refreshKey] optional client tick for sub‑1% micro drift
 */
export function getEngagementSurface(lang, refreshKey = 0) {
  const day = utcDayIndex();
  const seed = day * 7919 + refreshKey * 97;
  const s1 = smooth01(seed);
  const s2 = smooth01(seed + 1);
  const s3 = smooth01(seed + 2);

  /** Studio intake band — plausible for boutique studio */
  const lo = 28 + Math.round(s1 * 14);
  const hi = lo + 8 + Math.round(s2 * 6);
  const sessionsBand = lang === "fr" ? `${lo}–${hi} dossiers / 7 j.` : `${lo}–${hi} intakes / 7d`;

  const approvalPct = clamp(Math.round(93.5 + s2 * 4.2 + fract(refreshKey * 0.017) * 0.4), 92, 98);
  const recommendPct = clamp(Math.round(88 + s3 * 7 + fract(refreshKey * 0.013) * 0.5), 86, 96);

  const heatLevel = 1 + Math.floor((s1 + s2) * 1.51); // 1–3

  const microEn = [
    "Senior IC → Director bundles pacing normally this week.",
    "Concierge lane prioritizing executive storyline workshops.",
    "ATS export QA queue clearing within SLA band.",
  ];
  const microFr = [
    "Bundles IC senior → direction dans la bande SLA cette semaine.",
    "Voie concierge priorise ateliers storyline direction.",
    "File QA export ATS dans la fenêtre opérationnelle habituelle.",
  ];
  const micro = lang === "fr" ? microFr : microEn;
  const microIdx = day % micro.length;

  const quotesEn = [
    "“Board-ready in three sprints — discreet and fast.” — VP Engineering, EU",
    "“Finally reads like my mandate, not a template.” — CFO, NA",
    "“Bilingual pack landed clean with our Workday flow.” — HRBP, global",
  ];
  const quotesFr = [
    "« Prêt comité en trois sprints — discret et rapide. » — VP Engineering, UE",
    "« Enfin aligné à mon mandat, pas un modèle générique. » — CFO",
    "« Pack bilingue propre avec notre flux Workday. » — HRBP, global",
  ];
  const quotes = lang === "fr" ? quotesFr : quotesEn;
  const testimonialIdx = (day + refreshKey) % quotes.length;

  return {
    sessionsBand,
    approvalPct,
    recommendPct,
    heatLevel,
    microSignal: micro[microIdx],
    testimonialLine: quotes[testimonialIdx],
  };
}
