const { destroySession } = require("../../../lib/engagement/store");
const { parseCookies, clearCookie, COOKIE_SESSION } = require("../../../lib/engagement/cookies");

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const cookies = parseCookies(req.headers?.cookie || "");
  const token = cookies[COOKIE_SESSION];
  if (token) {
    await destroySession(token);
  }

  res.setHeader("Set-Cookie", clearCookie(COOKIE_SESSION));
  return res.status(200).json({ ok: true });
}
