/**
 * Bootstrap X-Ray HTTP capture (Node.js runtime only, fail-open).
 */
const LOG_PREFIX = "[observability/xray-bootstrap]";

function bootstrapXRay() {
  if (process.env.AWS_XRAY_SDK_ENABLED !== "true") return;

  try {
    const AWSXRay = require("aws-xray-sdk");
    AWSXRay.captureHTTPsGlobal(require("http"));
    AWSXRay.captureHTTPsGlobal(require("https"));
    console.log(`${LOG_PREFIX} HTTP(S) capture enabled`);
  } catch (error) {
    console.error(`${LOG_PREFIX} init failed (continuing without X-Ray)`, error);
  }
}

module.exports = { bootstrapXRay };
