const { parseCookies, serializeCookie, COOKIE_VISITOR, COOKIE_SESSION } = require("./cookies");
const { ensureVisitor, resolveSession } = require("./store");

/** @param {import('http').IncomingMessage} req */
async function readEngagementActor(req, res) {
  const cookies = parseCookies(req.headers?.cookie || "");
  let visitorId = cookies[COOKIE_VISITOR] || null;
  const sessionToken = cookies[COOKIE_SESSION] || null;

  let sessionRow = null;
  if (sessionToken) {
    sessionRow = await resolveSession(sessionToken);
  }

  let setVisitorCookie = null;
  const freshVisitorId = await ensureVisitor(visitorId);
  if (freshVisitorId && freshVisitorId !== visitorId) {
    visitorId = freshVisitorId;
    setVisitorCookie = serializeCookie(COOKIE_VISITOR, visitorId, { maxAge: 365 * 24 * 60 * 60 });
  }

  if (setVisitorCookie && res) {
    const prev = res.getHeader("Set-Cookie");
    if (prev) {
      const list = Array.isArray(prev) ? prev : [prev];
      res.setHeader("Set-Cookie", [...list, setVisitorCookie]);
    } else {
      res.setHeader("Set-Cookie", setVisitorCookie);
    }
  }

  return {
    visitorId,
    sessionToken,
    profileId: sessionRow?.profile_id ?? null,
    profileEmail: sessionRow?.email ?? null,
    profileName: sessionRow?.display_name ?? null,
  };
}

module.exports = { readEngagementActor, COOKIE_SESSION };
