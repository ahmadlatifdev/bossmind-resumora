/**
 * BossMind — OpenAI Codex agent layer status (for health API / Master Admin consumers).
 * Does not call Codex or GitHub; reports configuration + recent Neon repair signals when available.
 */

const fs = require("fs");
const path = require("path");

function loadCodexConfig() {
  const p = path.join(process.cwd(), "config", "bossmind-codex-agent-layer.json");
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

/**
 * @param {{ projectKey: string, neonEnabled: boolean }} opts
 */
async function getBossMindCodexLayerStatus({ projectKey, neonEnabled }) {
  const cfg = loadCodexConfig();
  const layerOn = process.env.BOSSMIND_CODEX_LAYER_ENABLED === "1";
  const githubHints =
    Boolean(process.env.BOSSMIND_GITHUB_APP_ID) &&
    Boolean(process.env.BOSSMIND_GITHUB_APP_INSTALLATION_ID);

  let lastRepair = null;
  let repositoryActivityHint = "use_github_actions_and_deploy_history";

  if (neonEnabled) {
    try {
      const { listRecentEvents } = require("../shared/neon-memory");
      const rows = await listRecentEvents({ projectKey, limit: 40 });
      const repair = rows.find((r) => (r.event_type || r.eventType) === "repair.flow.completed");
      if (repair) {
        lastRepair = {
          eventType: repair.event_type || repair.eventType,
          createdAt: repair.created_at || repair.createdAt,
          severity: repair.severity,
          deployOk: Boolean(repair.payload?.deployResult?.ok),
        };
      }
      const deploy = rows.find((r) => String(r.event_type || r.eventType || "").includes("deployment"));
      if (deploy) {
        repositoryActivityHint = `last_event_type:${deploy.event_type}`;
      }
    } catch {
      repositoryActivityHint = "neon_read_failed";
    }
  }

  const validationStatus = layerOn
    ? "bossmind_gates_required_before_merge"
    : "codex_layer_disabled";

  return {
    policyVersion: cfg?.version ?? 0,
    role: cfg?.role || "coding_repair_only",
    agentStatus: layerOn ? "enabled" : "disabled",
    githubAppHintsPresent: githubHints,
    lastRepair,
    repositoryActivityHint,
    validationStatus,
    safeDeployConfirmation:
      "merge_only_after_bossmind:deploy:gate_and_no_immutable_regression",
    forbiddenUses: cfg?.forbiddenPrimaryBrain || [],
    repairPipeline: cfg?.repairPipeline?.orderedSteps || [],
  };
}

module.exports = {
  getBossMindCodexLayerStatus,
};
