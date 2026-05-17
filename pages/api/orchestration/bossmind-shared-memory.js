/**
 * BossMind One Shared Memory API
 * GET: hub status + project context (read)
 * POST: seed rules | run shortcut | evaluate change (write — orchestrator only)
 */
const {
  getHubStatus,
  loadProjectContext,
  evaluateChangeAgainstRules,
  runShortcut,
  seedRulesFromConfig,
  canWrite,
  SHORTCUTS,
} = require("../../../lib/orchestration/bossmind-shared-memory-hub");

function authorize(req, requireWrite = false) {
  const dev = process.env.NODE_ENV === "development";
  const diag = process.env.BOSSMIND_DIAGNOSTICS === "1";
  const secret = process.env.BOSSMIND_ORCHESTRATION_SECRET;
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const ok = dev || diag || (Boolean(secret) && token === secret);
  if (!ok) return { ok: false };
  const writerAgent =
    req.headers["x-bossmind-writer-agent"] ||
    req.body?.writerAgent ||
    (requireWrite ? "" : "read_only");
  if (requireWrite && !canWrite(writerAgent) && !dev && !diag) {
    return { ok: false, reason: "write_agent_not_approved", writerAgent };
  }
  return { ok: true, writerAgent: writerAgent || "bossmind_orchestrator" };
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    const auth = authorize(req, false);
    if (!auth.ok) return res.status(401).json({ error: "Unauthorized" });

    const projectKey = req.query?.projectKey || process.env.BOSSMIND_PROJECT_KEY || "resumora";
    const action = req.query?.action || "status";

    try {
      if (action === "context") {
        const context = await loadProjectContext(projectKey, { writerAgent: auth.writerAgent });
        return res.status(200).json(context);
      }
      const status = await getHubStatus();
      return res.status(200).json({
        ...status,
        shortcuts: SHORTCUTS,
        projectKey,
        commands: {
          ensureTables: "npm run bossmind:shared-memory:ensure",
          shortcut: "npm run bossmind:shared-memory:shortcut -- --project=resumora --shortcut=verify_live",
        },
      });
    } catch (e) {
      return res.status(500).json({ error: e.message || "Shared memory read failed" });
    }
  }

  if (req.method === "POST") {
    const auth = authorize(req, true);
    if (!auth.ok) {
      return res.status(auth.reason === "write_agent_not_approved" ? 403 : 401).json({
        error: auth.reason || "Unauthorized",
      });
    }

    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const action = body.action || req.query?.action;
    const projectKey = body.projectKey || process.env.BOSSMIND_PROJECT_KEY || "resumora";

    try {
      if (action === "seed_rules") {
        const out = await seedRulesFromConfig({ writerAgent: auth.writerAgent });
        return res.status(out.ok ? 200 : 403).json(out);
      }
      if (action === "evaluate_change") {
        const context = await loadProjectContext(projectKey, { writerAgent: auth.writerAgent });
        const evaluation = evaluateChangeAgainstRules(body.change || {}, context);
        return res.status(200).json(evaluation);
      }
      if (action === "run_shortcut") {
        const out = await runShortcut(body.shortcutId, {
          projectKey,
          writerAgent: auth.writerAgent,
          dryRun: Boolean(body.dryRun),
        });
        return res.status(out.ok ? 200 : 207).json(out);
      }
      return res.status(400).json({
        error: "unknown_action",
        allowed: ["seed_rules", "evaluate_change", "run_shortcut"],
      });
    } catch (e) {
      return res.status(500).json({ error: e.message || "Shared memory write failed" });
    }
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed" });
}
