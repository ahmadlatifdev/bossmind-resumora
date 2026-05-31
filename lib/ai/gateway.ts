/**
 * BossMind AI Gateway — task-type routing to provider/model pairs.
 * Returns routing decisions for callers; execution stays in domain modules.
 */

const LOG_PREFIX = "[AI Gateway]";

export type TaskType =
  | "resume_parse"
  | "job_summary"
  | "ats_score"
  | "cover_letter_generation";

export type AiProvider = "deepseek" | "kimi";

export interface RouteConfig {
  model: string;
  provider: AiProvider;
  fallback?: string;
}

export interface RouteDecision extends RouteConfig {
  /** Resolved model id sent to the provider API (env aliases applied). */
  resolvedModel: string;
  resolvedFallback?: string;
}

export interface RoutedTask<TInput = unknown> extends RouteDecision {
  taskType: TaskType;
  input: TInput;
}

/** Logical model aliases → env-backed API model ids. */
const MODEL_ALIASES: Record<string, string[]> = {
  "deepseek-v4-pro": ["DEEPSEEK_MODEL_V4_PRO", "DEEPSEEK_MODEL", "DEEPSEEK_MODEL_V3"],
  "deepseek-v4-flash": ["DEEPSEEK_MODEL_V4_FLASH", "DEEPSEEK_MODEL", "DEEPSEEK_MODEL_V3"],
  "kimi-k2.6": ["KIMI_MODEL", "MOONSHOT_MODEL"],
};

const MODEL_DEFAULTS: Record<string, string> = {
  "deepseek-v4-pro": "deepseek-chat",
  "deepseek-v4-flash": "deepseek-chat",
  "kimi-k2.6": "moonshot-v1-128k",
};

const routingTable: Record<TaskType, RouteConfig> = {
  resume_parse: { model: "deepseek-v4-pro", provider: "deepseek" },
  job_summary: {
    model: "kimi-k2.6",
    provider: "kimi",
    fallback: "deepseek-v4-flash",
  },
  ats_score: { model: "deepseek-v4-pro", provider: "deepseek" },
  cover_letter_generation: { model: "deepseek-v4-pro", provider: "deepseek" },
};

function readEnvModel(keys: string[], fallback: string): string {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return fallback;
}

/** Map a routing-table alias to the concrete provider model id. */
export function resolveModelId(alias: string): string {
  const envKeys = MODEL_ALIASES[alias];
  if (envKeys) {
    return readEnvModel(envKeys, MODEL_DEFAULTS[alias] ?? alias);
  }
  return alias;
}

function enrichRoute(config: RouteConfig): RouteDecision {
  return {
    ...config,
    resolvedModel: resolveModelId(config.model),
    resolvedFallback: config.fallback ? resolveModelId(config.fallback) : undefined,
  };
}

/** Synchronous routing lookup (safe inside sync builders). */
export function getRouteConfig(taskType: TaskType): RouteDecision {
  const config = routingTable[taskType];
  if (!config) {
    throw new Error(`No route configured for task type: ${taskType}`);
  }
  return enrichRoute(config);
}

async function recordRoutingMetric(taskType: TaskType, decision: RouteDecision): Promise<void> {
  try {
    const { putMetric } = await import("../observability/cloudwatch");
    await putMetric("AiGatewayRoute", 1, {
      dimensions: {
        TaskType: taskType,
        Provider: decision.provider,
        Model: decision.model,
      },
    });
  } catch {
    /* fail-open */
  }
}

/**
 * Resolve provider/model for a task and return a routing envelope for the caller.
 */
export async function routeTask<TInput = unknown>(
  taskType: TaskType,
  input: TInput,
): Promise<RoutedTask<TInput>> {
  const decision = getRouteConfig(taskType);

  console.log(
    `${LOG_PREFIX} Routing ${taskType} to ${decision.provider}/${decision.model} → ${decision.resolvedModel}`,
  );

  await recordRoutingMetric(taskType, decision);

  return {
    taskType,
    ...decision,
    input,
  };
}

export { routingTable };
