/**
 * OpenTelemetry tracing — optional ADOT collector export (fail-open).
 * Enable with OTEL_EXPORTER_OTLP_ENDPOINT (default http://localhost:4318).
 */
const LOG_PREFIX = "[observability/otel]";

function isOtelEnabled() {
  return Boolean(process.env.OTEL_EXPORTER_OTLP_ENDPOINT);
}

async function startOtelTracing() {
  if (!isOtelEnabled()) return;

  try {
    const { NodeSDK } = require("@opentelemetry/sdk-node");
    const { OTLPTraceExporter } = require("@opentelemetry/exporter-trace-otlp-http");
    const { HttpInstrumentation } = require("@opentelemetry/instrumentation-http");
    const { AwsInstrumentation } = require("@opentelemetry/instrumentation-aws-sdk");
    const { Resource } = require("@opentelemetry/resources");
    const { ATTR_SERVICE_NAME } = require("@opentelemetry/semantic-conventions");

    const endpoint =
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? "http://localhost:4318";

    const sdk = new NodeSDK({
      resource: new Resource({
        [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME ?? "bossmind-resumora",
      }),
      traceExporter: new OTLPTraceExporter({ url: `${endpoint}/v1/traces` }),
      instrumentations: [new HttpInstrumentation(), new AwsInstrumentation()],
    });

    await sdk.start();
    console.log(`${LOG_PREFIX} started — exporting to ${endpoint}`);
  } catch (error) {
    console.error(`${LOG_PREFIX} init failed (continuing without OTEL)`, error);
  }
}

module.exports = { startOtelTracing, isOtelEnabled };
