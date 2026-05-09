/** Lightweight liveness probe for dev preview status / orchestration. */

export default function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false });
  }

  return res.status(200).json({
    ok: true,
    env: process.env.NODE_ENV || "development",
    ts: Date.now(),
  });
}
