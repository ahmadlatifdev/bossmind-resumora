/** Deterministic weekly marketing bundles (EN/FR). Changes every ISO week. */

const SITE_URL = "https://resumora.net";

export function getIsoWeekYear(d = new Date()) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
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

const HIGHLIGHTS_EN = [
  {
    title: "ATS depth week",
    body: "Parser-safe layouts plus lexical scaffolding tuned to your target mandate.",
    href: "/solutions/ats-resume",
    cta: "Explore ATS lane",
  },
  {
    title: "Executive proof stack",
    body: "KPI density and scope cues that read credible in first 6 seconds.",
    href: "/solutions/executive-resume",
    cta: "See executive lane",
  },
  {
    title: "Cross-border polish",
    body: "Country-aware registers without forking your storyline.",
    href: "/global-reach",
    cta: "Open global reach",
  },
];

const HIGHLIGHTS_FR = [
  {
    title: "Semaine profondeur ATS",
    body: "Mises en page parseur-safe et échafaudage lexical aligné au mandat.",
    href: "/solutions/ats-resume",
    cta: "Voir la ligne ATS",
  },
  {
    title: "Preuves direction",
    body: "Densité KPI et signaux de périmètre crédibles en six secondes.",
    href: "/solutions/executive-resume",
    cta: "Voir la ligne cadre",
  },
  {
    title: "Polish transfrontalier",
    body: "Registres pays sans bifurquer votre narration.",
    href: "/global-reach",
    cta: "Voir le globe",
  },
];

const TIPS_EN = [
  { title: "Canada", slug: "canada", tip: "Federal corridors reward bilingual ATS hygiene—keep proof stacks tight on 1–2 pages." },
  { title: "United States", slug: "usa", tip: "Hyperscale stacks skim outcomes first—front-load measurable lift." },
  { title: "United Kingdom", slug: "uk", tip: "Competency scaffolding wins for regulated lanes—pair succinct proof." },
  { title: "France", slug: "france", tip: "Executive French register with Anglo crossover signals mobility fluently." },
  { title: "UAE", slug: "uae", tip: "Gulf mandates favour board-adjacent tone—scope sovereign-scale programmes clearly." },
  { title: "Germany", slug: "germany", tip: "Technical panels expect KPI clarity—avoid ornamental adjectives." },
  { title: "Singapore", slug: "singapore", tip: "APAC HQs want crisp quantification anchoring regional EBITDA stories." },
  { title: "Australia", slug: "australia", tip: "Direct proof cultures reward EBITDA and team scale without fluff." },
];

const TIPS_FR = [
  { title: "Canada", slug: "canada", tip: "Les viviers fédéraux valorisent une hygiène ATS bilingue—preuves compactes sur 1–2 pages." },
  { title: "États-Unis", slug: "usa", tip: "Les stacks hyperscale lisent d’abord les résultats—montrez l’impact mesurable." },
  { title: "Royaume-Uni", slug: "uk", tip: "Les secteurs réglementés privilégient des compétences et preuves concises." },
  { title: "France", slug: "france", tip: "Registre cadre français avec pivot anglais pour mobilités convaincantes." },
  { title: "EAU", slug: "uae", tip: "Les mandats golfe favorisent un ton CODIR—cadrez les programmes à grande échelle." },
  { title: "Allemagne", slug: "germany", tip: "Les jurys techniques exigent des KPI nets—évitez le décoratif." },
  { title: "Singapour", slug: "singapore", tip: "Les sièges APAC veulent des chiffres nets sur EBITDA régional." },
  { title: "Australie", slug: "australia", tip: "Les cultures directes valorisent EBITDA, périmètre équipe et scaling." },
];

const QUOTES_EN = [
  { quote: "Quality callbacks arrived faster once the ATS narrative matched my operating reality.", author: "Director, Enterprise SaaS" },
  { quote: "Paris and Montréal searches finally ran off one coherent storyline.", author: "Strategy Lead, Dual market" },
];

const QUOTES_FR = [
  { quote: "Les retours qualité ont accéléré quand le récit ATS reflétait mon terrain réel.", author: "Directrice, SaaS entreprise" },
  { quote: "Paris et Montréal partagent enfin une narration unique.", author: "Lead stratégie, double marché" },
];

export function getWeeklyBundle(lang, date = new Date()) {
  const { year, week } = getIsoWeekYear(date);
  const weekId = `${year}-W${String(week).padStart(2, "0")}`;
  const s = seedFromWeek(year, week);
  const themes = lang === "fr" ? THEMES_FR : THEMES_EN;
  const theme = themes[s % themes.length];
  const highlights = lang === "fr" ? HIGHLIGHTS_FR : HIGHLIGHTS_EN;
  const tips = lang === "fr" ? TIPS_FR : TIPS_EN;
  const quotes = lang === "fr" ? QUOTES_FR : QUOTES_EN;
  const tip = tips[s % tips.length];
  const trust = quotes[s % quotes.length];

  const labels = lang === "fr"
    ? {
        edition: "Édition",
        featured: "À la une",
        visuals: "Visuels hebdo",
        insight: "Vidéo / insight",
        highlights: "Focus services",
        trust: "Confiance clients",
        tipTitle: "Astuce pays",
        ctaTitle: "Réservez sur resumora.net",
        ctaSubtitle: "Plans Basic · Professional · Elite — paiement sécurisé Stripe.",
        primaryCta: "Voir les tarifs",
        secondaryCta: "Concierge",
        watchLabel: "Lecture conseillée",
        photoAltA: "Palette luxe Resumora",
        photoAltB: "Signature visuelle studio",
        hashtags: "#Resumora #CVdirection #ATS #Carrière #Leadership",
      }
    : {
        edition: "Edition",
        featured: "Featured",
        visuals: "Weekly visuals",
        insight: "Video / insight",
        highlights: "Service focus",
        trust: "Client trust",
        tipTitle: "Country tip",
        ctaTitle: "Book on resumora.net",
        ctaSubtitle: "Basic · Professional · Elite plans — secure Stripe checkout.",
        primaryCta: "View pricing",
        secondaryCta: "Concierge",
        watchLabel: "Suggested watch",
        photoAltA: "Resumora luxury palette",
        photoAltB: "Studio signature visual",
        hashtags: "#Resumora #ExecutiveResume #ATS #Career #Leadership",
      };

  const rotateHighlights = [...highlights.slice(s % 3), ...highlights].slice(0, 3);

  return {
    weekId,
    year,
    week,
    siteUrl: SITE_URL,
    theme,
    labels,
    highlights: rotateHighlights,
    photos: [
      { src: "/resumora-logo.png", alt: labels.photoAltA, href: SITE_URL },
      { src: "/resumora-logo.png", alt: labels.photoAltB, href: `${SITE_URL}/capabilities` },
    ],
    video: {
      title: lang === "fr" ? `Insight semaine ${weekId}` : `Week insight · ${weekId}`,
      description:
        lang === "fr"
          ? "Variante hebdomadaire du studio—positionnement cadre et preuves mesurables."
          : "Weekly studio variant—executive positioning with measurable proof.",
      embedUrl: process.env.NEXT_PUBLIC_WEEKLY_VIDEO_EMBED || "",
      fallbackHref: `https://www.youtube.com/results?search_query=Resumora+resume+studio`,
    },
    trust,
    countryTip: tip,
    hashtags: labels.hashtags.split(" ").filter(Boolean),
    cta: {
      title: labels.ctaTitle,
      subtitle: labels.ctaSubtitle,
      primaryHref: "/pricing",
      secondaryHref: "/contact",
      primaryLabel: labels.primaryCta,
      secondaryLabel: labels.secondaryCta,
    },
  };
}
