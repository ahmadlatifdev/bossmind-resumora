/** Deterministic weekly marketing hero copy (EN/FR). No rotating visuals/cards — homepage stays enterprise-minimal. */

const SITE_URL = "https://resumora.net";

/** Uses UTC calendar date only — identical on server, SSG build, and client hydration. */
export function getIsoWeekYear(d = new Date()) {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
  return { year: date.getUTCFullYear(), week: weekNo };
}

function seedFromWeek(year, week) {
  return (year * 53 + week) % 997;
}

const THEMES_EN = [
  {
    kicker: "This week · ATS sovereignty",
    headline: "Make hiring systems surface your real mandate—not a trimmed CV.",
    lead: "Weekly spotlight on lexical architecture and recruiter skim zones that Fortune pipelines reward.",
  },
  {
    kicker: "This week · Executive narrative",
    headline: "Leadership tone that survives Greenhouse, Lever, and board referrals.",
    lead: "How we harmonise outcomes, scope, and velocity without diluting your voice.",
  },
  {
    kicker: "This week · Global mobility",
    headline: "One storyline that flexes across Toronto, Paris, and Dubai shortlists.",
    lead: "Regional registers calibrated—pricing stays USD-consistent wherever you interview.",
  },
  {
    kicker: "This week · Interview velocity",
    headline: "From dossier to panel-ready narrative in a governed cadence.",
    lead: "Professional and Elite lanes prioritise strategist blocks when capacity allows.",
  },
];

const THEMES_FR = [
  {
    kicker: "Cette semaine · Souveraineté ATS",
    headline: "Faites lire votre mandat réel aux systèmes—pas un CV écourté.",
    lead: "Focus hebdo sur architecture lexicale et zones de lecture recruteur prisées en viviers Fortune.",
  },
  {
    kicker: "Cette semaine · Narratif direction",
    headline: "Ton de leadership compatible Greenhouse, Lever et recommandations CODIR.",
    lead: "Alignement résultats, périmètre et vélocité sans diluer votre voix.",
  },
  {
    kicker: "Cette semaine · Mobilité mondiale",
    headline: "Une narration qui s’adapte à Toronto, Paris et Dubaï.",
    lead: "Registres régionaux calibrés—tarification USD stable partout.",
  },
  {
    kicker: "Cette semaine · Vélocité entretien",
    headline: "Du dossier au récit panel-ready dans une cadence gouvernée.",
    lead: "Les paliers Professionnel et Élite ouvrent des blocs stratèges selon capacité.",
  },
];

export function getWeeklyBundle(lang, date = new Date()) {
  const { year, week } = getIsoWeekYear(date);
  const weekId = `${year}-W${String(week).padStart(2, "0")}`;
  const s = seedFromWeek(year, week);
  const themes = lang === "fr" ? THEMES_FR : THEMES_EN;
  const theme = themes[s % themes.length];

  const labels =
    lang === "fr"
      ? {
          edition: "Édition",
          ctaTitle: "Réservez sur resumora.net",
          ctaSubtitle: "Plans Basic · Professional · Elite — paiement sécurisé Stripe.",
          primaryCta: "Voir les tarifs",
          secondaryCta: "Chat",
          heroSecureUpload: "Téléversement sécurisé",
        }
      : {
          edition: "Edition",
          ctaTitle: "Book on resumora.net",
          ctaSubtitle: "Basic · Professional · Elite plans — secure Stripe checkout.",
          primaryCta: "View pricing",
          secondaryCta: "Chat",
          heroSecureUpload: "Secure upload",
        };

  return {
    weekId,
    year,
    week,
    siteUrl: SITE_URL,
    theme,
    labels,
    cta: {
      title: labels.ctaTitle,
      subtitle: labels.ctaSubtitle,
      primaryHref: "/pricing",
      secondaryHref: "/chat",
      primaryLabel: labels.primaryCta,
      secondaryLabel: labels.secondaryCta,
    },
  };
}
