import {
  CloudWatchClient,
  PutMetricDataCommand,
  type StandardUnit,
} from "@aws-sdk/client-cloudwatch";

const LOG_PREFIX = "[observability/cloudwatch]";

const NAMESPACE = process.env.CLOUDWATCH_NAMESPACE ?? "BossMind/Resumora";

let client: CloudWatchClient | null = null;

function getClient(): CloudWatchClient {
  if (!client) {
    client = new CloudWatchClient({});
  }
  return client;
}

function resolveEnvironment(): string {
  return (
    process.env.SENTRY_ENVIRONMENT ??
    process.env.BOSSMIND_DEPLOY_ENV ??
    process.env.NODE_ENV ??
    "development"
  );
}

function resolveProject(project?: string): string {
  return project ?? process.env.BOSSMIND_PROJECT ?? "resumora";
}

function buildDimensions(
  extra: Record<string, string | undefined> = {},
): Array<{ Name: string; Value: string }> {
  const merged: Record<string, string> = {
    Project: resolveProject(extra.Project),
    Environment: extra.Environment ?? resolveEnvironment(),
  };

  if (extra.Model) merged.Model = extra.Model;
  if (extra.Status) merged.Status = extra.Status;

  return Object.entries(merged).map(([Name, Value]) => ({ Name, Value }));
}

export type PutMetricOptions = {
  unit?: StandardUnit;
  dimensions?: Record<string, string | undefined>;
};

export async function putMetric(
  metricName: string,
  value: number,
  options: PutMetricOptions = {},
): Promise<void> {
  try {
    const command = new PutMetricDataCommand({
      Namespace: NAMESPACE,
      MetricData: [
        {
          MetricName: metricName,
          Value: value,
          Unit: options.unit ?? "None",
          Dimensions: buildDimensions(options.dimensions),
          Timestamp: new Date(),
        },
      ],
    });
    await getClient().send(command);
  } catch (error) {
    console.error(LOG_PREFIX, "putMetric failed", { metricName, error });
  }
}

export async function recordResumeParsingLatency(
  latencyMs: number,
  options: { model?: string; status?: string; project?: string } = {},
): Promise<void> {
  try {
    await putMetric("ResumeParsingLatency", latencyMs, {
      unit: "Milliseconds",
      dimensions: {
        Model: options.model ?? "unknown",
        Status: options.status ?? "ok",
        Project: options.project,
      },
    });
  } catch (error) {
    console.error(LOG_PREFIX, "recordResumeParsingLatency failed", error);
  }
}

export async function recordResumeParsingSuccess(
  options: { model?: string; project?: string } = {},
): Promise<void> {
  try {
    await putMetric("ResumeParsingSuccess", 1, {
      unit: "Count",
      dimensions: {
        Model: options.model ?? "unknown",
        Status: "success",
        Project: options.project,
      },
    });
  } catch (error) {
    console.error(LOG_PREFIX, "recordResumeParsingSuccess failed", error);
  }
}

export async function recordSentryError(
  options: { project?: string; status?: string } = {},
): Promise<void> {
  try {
    await putMetric("SentryErrorCount", 1, {
      unit: "Count",
      dimensions: {
        Status: options.status ?? "error",
        Project: options.project,
      },
    });
  } catch (error) {
    console.error(LOG_PREFIX, "recordSentryError failed", error);
  }
}

export type RecordApiCallOptions = {
  route: string;
  status: number;
  latencyMs: number;
  project?: string;
  method?: string;
};

export async function recordApiCall(options: RecordApiCallOptions): Promise<void> {
  try {
    const statusLabel = String(options.status);
    const dimensions = {
      Status: statusLabel,
      Project: options.project,
      Model: options.method ?? "http",
    };

    await putMetric("APICallCount", 1, {
      unit: "Count",
      dimensions,
    });
    await putMetric("APICallLatency", options.latencyMs, {
      unit: "Milliseconds",
      dimensions: {
        ...dimensions,
        Model: options.route,
      },
    });
  } catch (error) {
    console.error(LOG_PREFIX, "recordApiCall failed", error);
  }
}

export async function recordDeepSeekTokenUsage(
  tokens: number,
  options: { model?: string; project?: string; status?: string } = {},
): Promise<void> {
  try {
    await putMetric("DeepSeekTokenUsage", tokens, {
      unit: "Count",
      dimensions: {
        Model: options.model ?? "deepseek",
        Status: options.status ?? "ok",
        Project: options.project,
      },
    });
  } catch (error) {
    console.error(LOG_PREFIX, "recordDeepSeekTokenUsage failed", error);
  }
}
