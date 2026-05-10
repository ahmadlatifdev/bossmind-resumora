const {
  listKnownErrors,
  saveDeploymentHistory,
  saveEvent,
  saveMissingUpdate,
  upsertErrorMemory,
  upsertTaskState,
} = require("../shared/neon-memory");
const { callRepairPlannerModel } = require("../ai/repair-model");

async function callLocalModel({ prompt, model = "qwen2.5-coder:1.5b" }) {
  return callRepairPlannerModel({ prompt, ollamaModel: model });
}

async function runRepairFlow({
  projectKey,
  sentryEvent,
  validationResult = { ok: false, details: "Validation was not executed yet." },
  deployResult = { ok: false, details: "Deploy step is external." },
}) {
  const baseState = {
    projectKey,
    sentryEvent,
    knownFixes: [],
    proposedFix: "",
    validationResult,
    deployResult,
    flowSummary: "",
  };

  await saveEvent({
    projectKey,
    source: "sentry",
    eventType: "sentry.error.received",
    severity: "error",
    payload: sentryEvent,
  });

  await upsertErrorMemory({
    projectKey,
    errorType: sentryEvent.errorType || "runtime_error",
    errorMessage: sentryEvent.errorMessage || "Unknown failure",
    stackExcerpt: sentryEvent.stack || "",
    rootCause: sentryEvent.rootCause || "",
  });

  await upsertTaskState({
    projectKey,
    taskKey: `repair:${sentryEvent.eventId || Date.now()}`,
    status: "in_progress",
    assignedAgent: "langgraph-supervisor",
    payload: { phase: "knowledge_lookup" },
  });

  const knownFixes = await listKnownErrors({ projectKey, limit: 20 });

  const graphResult = await runLangGraphSupervisor({
    projectKey,
    sentryEvent,
    knownFixes,
  });
  const aiFixPattern = graphResult.proposedFix;

  await upsertErrorMemory({
    projectKey,
    errorType: sentryEvent.errorType || "runtime_error",
    errorMessage: sentryEvent.errorMessage || "Unknown failure",
    stackExcerpt: sentryEvent.stack || "",
    rootCause: sentryEvent.rootCause || "",
    fixPattern: aiFixPattern,
  });

  const flowSummary = {
    pipeline:
      "Sentry -> shared error memory -> LangGraph supervisor/worker -> repair agent -> validation -> deploy -> save fix pattern",
    proposedFix: aiFixPattern,
    validationResult,
    deployResult,
  };

  if (!validationResult.ok) {
    await saveMissingUpdate({
      projectKey,
      taskKey: `repair:${sentryEvent.eventId || "unknown"}`,
      reason: "Validation step is not passing.",
      payload: validationResult,
    });
  }

  await saveDeploymentHistory({
    projectKey,
    status: deployResult.ok ? "success" : "pending",
    summary: flowSummary.pipeline,
    metadata: flowSummary,
  });

  await saveEvent({
    projectKey,
    source: "langgraph",
    eventType: "repair.flow.completed",
    severity: deployResult.ok ? "info" : "warning",
    payload: flowSummary,
  });

  return { ...baseState, knownFixes, proposedFix: aiFixPattern, flowSummary };
}

async function runLangGraphSupervisor({
  projectKey,
  sentryEvent,
  knownFixes,
}) {
  let langgraph;
  try {
    langgraph = await import("@langchain/langgraph");
  } catch (_error) {
    return runFallbackWorkerFlow({ sentryEvent, knownFixes });
  }
  try {
    const { StateGraph } = langgraph;
    const END = "__end__";

    const workerNode = async (state) => {
      const prompt = [
        "You are a repair planner.",
        `Project: ${projectKey}`,
        `Error type: ${sentryEvent.errorType || "unknown"}`,
        `Error message: ${sentryEvent.errorMessage || "unknown"}`,
        `Stack: ${sentryEvent.stack || "none"}`,
        `Known fixes: ${JSON.stringify(knownFixes.slice(0, 5))}`,
        "Return a concise reusable repair pattern.",
      ].join("\n");

      const proposedFix = await callLocalModel({ prompt }).catch((error) => {
        return `Local model unavailable: ${error.message}`;
      });

      return { ...state, proposedFix };
    };

    const validatorNode = async (state) => {
      return {
        ...state,
        validationHint: state.proposedFix
          ? "candidate_fix_generated"
          : "candidate_fix_missing",
      };
    };

    const graph = new StateGraph({
      channels: {
        proposedFix: "string",
        validationHint: "string",
      },
    })
      .addNode("repair_worker", workerNode)
      .addNode("validate_candidate", validatorNode)
      .addEdge("repair_worker", "validate_candidate")
      .addEdge("validate_candidate", END)
      .setEntryPoint("repair_worker")
      .compile();

    const output = await graph.invoke({
      proposedFix: "",
      validationHint: "",
    });
    return { proposedFix: output.proposedFix || "" };
  } catch (_error) {
    return runFallbackWorkerFlow({ sentryEvent, knownFixes });
  }
}

async function runFallbackWorkerFlow({ sentryEvent, knownFixes }) {
  const prompt = [
    "You are a repair planner.",
    `Error type: ${sentryEvent.errorType || "unknown"}`,
    `Error message: ${sentryEvent.errorMessage || "unknown"}`,
    `Stack: ${sentryEvent.stack || "none"}`,
    `Known fixes: ${JSON.stringify(knownFixes.slice(0, 5))}`,
    "Return a concise reusable repair pattern.",
  ].join("\n");
  const proposedFix = await callLocalModel({ prompt }).catch((error) => {
    return `Local model unavailable: ${error.message}`;
  });
  return { proposedFix };
}

module.exports = {
  runRepairFlow,
};
