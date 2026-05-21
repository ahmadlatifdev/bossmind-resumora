/**
 * Zero-guidance client journey — progress, next action, upload wizard, EN/FR labels.
 */
const { getSqlClient, ensureEngagementSchema } = require("../shared/neon-memory");
const { listEntitlementsForUser } = require("./entitlements-store");
const { listWorkspaceDocuments, getGenerationStatus } = require("./workspace-store");
const { getDeliverableForPlan } = require("./deliverables-catalog");
const { getFreeEditsCount } = require("./plan-policy");

const STEPS = [
  { key: "accountCreated", en: "Account Created", fr: "Compte cree" },
  { key: "planSelected", en: "Plan Selected", fr: "Forfait selectionne" },
  { key: "paymentCompleted", en: "Payment Completed", fr: "Paiement confirme" },
  { key: "documentsUploaded", en: "Documents Uploaded", fr: "Documents televerses" },
  { key: "resumeInProgress", en: "Resume In Progress", fr: "CV en cours" },
  { key: "resumeReady", en: "Resume Ready", fr: "CV pret" },
  { key: "downloadDelivered", en: "Download Delivered", fr: "Telechargement effectue" },
  { key: "freeEditAvailable", en: "Free Edit Available", fr: "Retouche gratuite disponible" },
];

const UPLOAD_STEPS = [
  { key: "upload_resume", required: true, en: "Upload Resume", fr: "Televerser le CV" },
  { key: "upload_job_description", required: true, en: "Upload Job Description", fr: "Televerser la description de poste" },
  { key: "upload_credentials", required: false, en: "Upload Certifications (optional)", fr: "Televerser certifications (optionnel)" },
  { key: "upload_portfolio", required: false, en: "Upload Portfolio (optional)", fr: "Televerser portfolio (optionnel)" },
];

function onboardingTaskKey(profileId) {
  return `onboarding:${profileId}`;
}

async function getOnboardingState(profileId, lang = "en") {
  const sql = getSqlClient();
  if (!sql || !profileId) {
    return {
      steps: STEPS.map((s) => ({ ...s, done: s.key === "accountCreated" })),
      percent: 0,
      uploadWizard: {},
      activePlanId: null,
    };
  }
  await ensureEngagementSchema();
  const rows = await sql.query(
    `SELECT status, payload FROM task_state WHERE project_key = $1 AND task_key = $2 LIMIT 1`,
    [process.env.BOSSMIND_PROJECT_KEY || "resumora", onboardingTaskKey(profileId)]
  );
  const payload = rows?.[0]?.payload || {};
  const uploadWizard = payload.uploadWizard || {};
  const entitlements = await listEntitlementsForUser(profileId, "");
  const activePlanId = entitlements[0]?.plan_id || payload.activePlanId || null;
  const docs = activePlanId ? await listWorkspaceDocuments(profileId, activePlanId) : [];
  const gen = activePlanId ? await getGenerationStatus(profileId, activePlanId) : null;
  const genStatus = gen?.status || gen?.payload?.status || "queued";

  const done = {
    accountCreated: true,
    planSelected: Boolean(payload.planSelected || activePlanId),
    paymentCompleted: Boolean(payload.paymentCompleted || activePlanId),
    documentsUploaded: docs.some((d) => d.doc_type === "resume"),
    resumeInProgress: ["queued", "analyzing", "generating", "reviewing", "finalizing"].includes(genStatus),
    resumeReady: genStatus === "ready" || payload.deliveryReady === true,
    downloadDelivered: Boolean(payload.downloadDelivered),
    freeEditAvailable: activePlanId ? (getFreeEditsCount(activePlanId) > 0) : false,
  };

  const steps = STEPS.map((s) => ({
    ...s,
    label: lang === "fr" ? s.fr : s.en,
    done: Boolean(done[s.key]),
  }));
  const doneCount = steps.filter((s) => s.done).length;
  const percent = Math.round((doneCount / steps.length) * 100);

  const doneMap = done;
  return { steps, percent, uploadWizard, activePlanId, genStatus, docs, done: doneMap };
}

async function getNextAction(profileId, lang = "en", routerQuery = {}) {
  const L = lang === "fr" ? "fr" : "en";
  const sessionId = String(routerQuery?.session_id || "").trim();
  if (sessionId) {
    return {
      path: `/studio?session_id=${encodeURIComponent(sessionId)}`,
      action: "complete_checkout_activation",
      label: L === "fr" ? "Activer votre espace payant" : "Activate your paid workspace",
    };
  }

  const s = await getOnboardingState(profileId);
  const d = s.done || {};
  const planId = s.activePlanId;
  const deliverable = planId ? getDeliverableForPlan(planId, lang) : null;
  const studioPath = deliverable?.studioPath || "/studio";

  if (!d.accountCreated) {
    return { path: "/register", action: "register", label: L === "fr" ? "Creer un compte" : "Create account" };
  }
  if (!d.planSelected && !d.paymentCompleted) {
    const pending = routerQuery?.plan || routerQuery?.selectedPlan;
    if (pending) {
      return {
        path: `/pricing?selectedPlan=${encodeURIComponent(pending)}`,
        action: "select_plan",
        label: L === "fr" ? "Selectionner un forfait" : "Select your plan",
      };
    }
    return {
      path: "/pricing",
      action: "select_plan",
      label: L === "fr" ? "Choisir un forfait" : "Choose your plan",
    };
  }
  if (!d.paymentCompleted) {
    return {
      path: "/pricing?continueCheckout=1",
      action: "pay",
      label: L === "fr" ? "Finaliser le paiement" : "Complete payment",
    };
  }
  if (!d.documentsUploaded) {
    return {
      path: `${studioPath}?onboarding=upload`,
      action: "upload",
      label: L === "fr" ? "Televerser vos documents" : "Upload your documents",
    };
  }
  if (!d.resumeReady) {
    return {
      path: studioPath,
      action: "wait_generation",
      label: L === "fr" ? "Voir la progression" : "View progress",
    };
  }
  return {
    path: studioPath,
    action: "studio",
    label: L === "fr" ? "Ouvrir mon studio" : "Open my studio",
  };
}

async function markOnboarding(profileId, patch) {
  const sql = getSqlClient();
  if (!sql || !profileId) return;
  await ensureEngagementSchema();
  const existing = await sql.query(
    `SELECT payload FROM task_state WHERE project_key = $1 AND task_key = $2 LIMIT 1`,
    [process.env.BOSSMIND_PROJECT_KEY || "resumora", onboardingTaskKey(profileId)]
  );
  const payload = { ...(existing?.[0]?.payload || {}), ...patch };
  await sql.query(
    `INSERT INTO task_state (project_key, task_key, status, assigned_agent, payload, updated_at)
     VALUES ($1, $2, 'onboarding', 'journey', $3::jsonb, NOW())
     ON CONFLICT (project_key, task_key) DO UPDATE SET
       payload = task_state.payload || EXCLUDED.payload,
       updated_at = NOW()`,
    [process.env.BOSSMIND_PROJECT_KEY || "resumora", onboardingTaskKey(profileId), payload]
  );
}

async function upsertOnboardingFromSession(profileId, stripeSessionId) {
  if (!profileId) return;
  await markOnboarding(profileId, {
    paymentCompleted: true,
    planSelected: true,
    activePlanId: null,
  });
}

module.exports = {
  STEPS,
  UPLOAD_STEPS,
  getOnboardingState,
  getNextAction,
  markOnboarding,
  upsertOnboardingFromSession,
};
