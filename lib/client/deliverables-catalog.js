const fs = require("fs");
const path = require("path");

let cached = null;

function loadCatalog() {
  if (cached) return cached;
  const p = path.join(process.cwd(), "config/resumora-client-deliverables.json");
  cached = JSON.parse(fs.readFileSync(p, "utf8"));
  return cached;
}

function getDeliverableForPlan(planId, lang = "en") {
  const catalog = loadCatalog();
  const plan = catalog.plans?.[planId];
  if (!plan) return null;
  const L = lang === "fr" ? "fr" : "en";
  return {
    planId,
    displayName: plan.displayName?.[L] || planId,
    studioPath: plan.studioPath || "/studio",
    welcomeAssetId: plan.welcomeAssetId,
    features: plan.features?.[L] || [],
  };
}

function renderWelcomeGuide(planId, lang = "en") {
  const L = lang === "fr" ? "fr" : "en";
  const d = getDeliverableForPlan(planId, lang);
  if (!d) return null;

  const lines = (d.features || []).map((f) => `- ${f}`).join("\n");
  return `# Resumora — ${d.displayName}

${L === "fr" ? "Merci pour votre achat. Votre espace client est activé." : "Thank you for your purchase. Your client space is now active."}

## ${L === "fr" ? "Prochaines étapes" : "Next steps"}

${lines}

## ${L === "fr" ? "Espace client" : "Client hub"}

${L === "fr" ? "Accédez à" : "Visit"}: ${d.studioPath}

---
Resumora · ${new Date().toISOString().slice(0, 10)}
`;
}

module.exports = {
  loadCatalog,
  getDeliverableForPlan,
  renderWelcomeGuide,
};
