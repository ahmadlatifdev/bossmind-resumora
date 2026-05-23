/**
 * Ensures API routes always respond with JSON (never Next HTML error pages).
 */
function sendJson(res, status, payload = {}) {
  if (res.headersSent) return;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("X-Resumora-Api", "json");
  const ok = status >= 200 && status < 400;
  res.status(status).json({ ok, ...payload });
}

function withJsonApi(handler, { source = "api" } = {}) {
  return async function jsonApiRoute(req, res) {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("X-Resumora-Api", "json");
    try {
      await handler(req, res);
    } catch (err) {
      console.error(`[${source}]`, err?.message || err, err?.stack);
      if (!res.headersSent) {
        sendJson(res, 500, {
          error: "internal_error",
          message:
            process.env.NODE_ENV === "production"
              ? "A temporary server error occurred. Please try again."
              : String(err?.message || "internal_error").slice(0, 240),
        });
      }
    }
  };
}

module.exports = { sendJson, withJsonApi };
