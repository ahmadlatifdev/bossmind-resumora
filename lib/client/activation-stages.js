/**
 * Luxury activation stage model — shared by API + client UI (no Node-only deps in UI copy).
 */

const STAGE_DEFS = [
  { key: "payment", en: "Confirming payment", fr: "Confirmation du paiement" },
  { key: "plan", en: "Activating your plan", fr: "Activation de votre forfait" },
  { key: "upload", en: "Preparing your upload workspace", fr: "Preparation de l'espace de televersement" },
  { key: "dashboard", en: "Creating your resume generation dashboard", fr: "Creation du tableau de bord CV" },
  { key: "edits", en: "Loading your free edits", fr: "Chargement de vos retouches gratuites" },
];

const CONCIERGE_EN = [
  "Your AI concierge is verifying payment with Stripe.",
  "Binding your executive plan to your secure account.",
  "Preparing encrypted document upload channels.",
  "Configuring your resume generation command center.",
  "Loading revision credits and delivery preferences.",
];

const CONCIERGE_FR = [
  "Votre concierge IA verifie le paiement avec Stripe.",
  "Association de votre forfait executif a votre compte securise.",
  "Preparation des canaux de televersement chiffres.",
  "Configuration de votre centre de commande CV.",
  "Chargement des credits de revision et preferences de livraison.",
];

const CONCIERGE_EXTENDED_EN =
  "Still securing your workspace with Stripe — this usually completes within a minute.";
const CONCIERGE_EXTENDED_FR =
  "Securisation de votre espace avec Stripe — termine habituellement en moins d'une minute.";

function stageFlags(activation, uiAttempt = 0) {
  const a = activation || {};
  const fromApi = [
    Boolean(a.paymentConfirmed),
    Boolean(a.planActivated),
    Boolean(a.workspaceReady),
    Boolean(a.uploadsUnlocked),
    Boolean(a.generationReady),
  ];
  if (fromApi.some(Boolean)) return fromApi;
  return [uiAttempt >= 1, uiAttempt >= 2, uiAttempt >= 3, uiAttempt >= 4, uiAttempt >= 5];
}

function buildLuxuryStages(activation, uiAttempt = 0, lang = "en", { extended = false } = {}) {
  const flags = stageFlags(activation, uiAttempt);
  const concierge = lang === "fr" ? CONCIERGE_FR : CONCIERGE_EN;
  const stages = STAGE_DEFS.map((s, i) => ({
    key: s.key,
    label: lang === "fr" ? s.fr : s.en,
    done: flags[i],
    active: !flags[i] && (i === 0 || flags[i - 1]),
    conciergeLine: concierge[i],
  }));
  if (extended && !flags[4]) {
    const last = stages[4];
    last.active = true;
    stages.forEach((s, i) => {
      if (i < 4 && !flags[i]) s.active = false;
    });
  }
  return stages;
}

function activeConciergeMessage(stages, lang = "en", { extended = false } = {}) {
  if (extended) {
    return lang === "fr" ? CONCIERGE_EXTENDED_FR : CONCIERGE_EXTENDED_EN;
  }
  const active = stages.find((s) => s.active) || stages.find((s) => !s.done);
  if (active?.conciergeLine) return active.conciergeLine;
  return lang === "fr"
    ? "Finalisation de votre espace securise Resumora."
    : "Finalizing your secure Resumora workspace.";
}

function progressPercent(activation, uiAttempt, maxAttempts = 5) {
  const stages = buildLuxuryStages(activation, uiAttempt, "en");
  const done = stages.filter((s) => s.done).length;
  const fromAttempt = Math.min(95, Math.round((uiAttempt / maxAttempts) * 100));
  const fromStages = Math.round((done / stages.length) * 100);
  return Math.max(fromAttempt, fromStages);
}

module.exports = {
  STAGE_DEFS,
  buildLuxuryStages,
  activeConciergeMessage,
  progressPercent,
};
