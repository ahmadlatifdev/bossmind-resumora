/**
 * BossMind Resumora — LLM-first resume parser (DeepSeek + @edwinfom/resume-intel).
 * Fail-open observability; serverless-safe (OCR disabled on Render/Vercel/Lambda).
 */
import { createDeepSeek } from "@ai-sdk/deepseek";
import {
  parseResume,
  streamResume,
  type ResumeIntelOptions,
  type ResumeIntelResult,
  type ResumeSectionKey,
  type StreamResumeEvent,
} from "@edwinfom/resume-intel";

import {
  recordDeepSeekTokenUsage,
  recordResumeParsingLatency,
  recordResumeParsingSuccess,
} from "./observability/cloudwatch";
import { captureAsyncSegment } from "./observability/xray";

const LOG_PREFIX = "[resume-parser]";

export type ParseResumeInput = Buffer | ArrayBuffer | Uint8Array;

export type BossMindParseResumeOptions = {
  /** Override sections to extract (defaults to resume-intel DEFAULT_SECTIONS). */
  sections?: ResumeSectionKey[];
  /** Enable PII redaction before LLM (GDPR-friendly). */
  redactPii?: boolean;
  /** Max concurrent section LLM calls (helps DeepSeek rate limits). */
  maxConcurrency?: number;
  /** Custom system prompt prefix for domain tuning. */
  systemPromptPrefix?: string;
  /** Abort long-running parses. */
  abortSignal?: AbortSignal;
  /** Project label for CloudWatch dimensions. */
  project?: string;
};

function isServerlessRuntime(): boolean {
  return Boolean(
    process.env.VERCEL ||
      process.env.RENDER ||
      process.env.AWS_LAMBDA_FUNCTION_NAME ||
      process.env.RAILWAY_ENVIRONMENT,
  );
}

function resolveDeepSeekModel() {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error("DEEPSEEK_API_KEY is not set");
  }

  const deepseek = createDeepSeek({ apiKey });
  const modelId =
    process.env.DEEPSEEK_MODEL ||
    process.env.DEEPSEEK_MODEL_V3 ||
    "deepseek-chat";

  return deepseek(modelId);
}

function buildIntelOptions(
  overrides: BossMindParseResumeOptions = {},
): ResumeIntelOptions {
  return {
    model: resolveDeepSeekModel() as ResumeIntelOptions["model"],
    layoutStrategy: "spatial",
    useTaskDecomposition: true,
    maxRetries: 3,
    maxConcurrency: overrides.maxConcurrency ?? 3,
    sections: overrides.sections,
    redactPii: overrides.redactPii ?? false,
    systemPromptPrefix:
      overrides.systemPromptPrefix ??
      "BossMind Resumora — extract structured JSON Resume v1 data accurately.",
    abortSignal: overrides.abortSignal,
    disableOcr: isServerlessRuntime(),
    onProgress: (section, success) => {
      if (process.env.BOSSMIND_DIAGNOSTICS === "1") {
        console.log(`${LOG_PREFIX} section ${section}: ${success ? "ok" : "fail"}`);
      }
    },
  };
}

async function recordParseMetrics(
  result: ResumeIntelResult,
  latencyMs: number,
  project?: string,
  status: "ok" | "error" = "ok",
): Promise<void> {
  try {
    await recordResumeParsingLatency(latencyMs, {
      model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
      status,
      project,
    });
    if (status === "ok") {
      await recordResumeParsingSuccess({
        model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
        project,
      });
    }
    const tokens = result.meta.tokenUsage?.totalTokens;
    if (typeof tokens === "number" && tokens > 0) {
      await recordDeepSeekTokenUsage(tokens, {
        model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
        project,
        status,
      });
    }
  } catch (error) {
    console.error(`${LOG_PREFIX} metrics failed (continuing)`, error);
  }
}

/**
 * Parse a resume PDF/DOCX buffer into structured JSON Resume data.
 */
export async function parseBossMindResume(
  input: ParseResumeInput,
  options: BossMindParseResumeOptions = {},
): Promise<ResumeIntelResult> {
  const start = Date.now();
  const project = options.project ?? process.env.BOSSMIND_PROJECT ?? "resumora";

  return captureAsyncSegment(
    "ResumeParsing",
    async () => {
      try {
        const result = await parseResume(input, buildIntelOptions(options));
        await recordParseMetrics(result, Date.now() - start, project, "ok");
        return result;
      } catch (error) {
        await recordResumeParsingLatency(Date.now() - start, {
          model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
          status: "error",
          project,
        }).catch(() => undefined);

        try {
          const Sentry = await import("@sentry/nextjs");
          Sentry.captureException(error);
        } catch {
          /* fail-open */
        }

        throw error;
      }
    },
    { project, model: process.env.DEEPSEEK_MODEL || "deepseek-chat" },
  );
}

/**
 * Stream resume parsing section-by-section (progressive UI).
 */
export async function* streamBossMindResume(
  input: ParseResumeInput,
  options: BossMindParseResumeOptions = {},
): AsyncGenerator<StreamResumeEvent> {
  const start = Date.now();
  const project = options.project ?? process.env.BOSSMIND_PROJECT ?? "resumora";

  try {
    for await (const event of streamResume(input, buildIntelOptions(options))) {
      if (event.type === "done") {
        await recordParseMetrics(event.result, Date.now() - start, project, "ok");
      }
      yield event;
    }
  } catch (error) {
    await recordResumeParsingLatency(Date.now() - start, {
      model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
      status: "error",
      project,
    }).catch(() => undefined);
    throw error;
  }
}

export { parseResume, streamResume };
export type { ResumeIntelResult, StreamResumeEvent, ResumeSectionKey };
