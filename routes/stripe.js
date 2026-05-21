const express = require("express");
const router = express.Router();

const SITE = String(process.env.NEXT_PUBLIC_SITE_URL || "https://www.resumora.net").replace(/\/$/, "");

/** Legacy Express routes — forward to Next.js production journey (no mock HTML loops). */
router.get("/success", (req, res) => {
  const sessionId = String(req.query.session_id || "").trim();
  if (!sessionId) {
    return res.redirect(302, `${SITE}/studio`);
  }
  return res.redirect(
    302,
    `${SITE}/success?session_id=${encodeURIComponent(sessionId)}`
  );
});

router.get("/cancel", (req, res) => {
  res.redirect(302, `${SITE}/cancel`);
});

router.post("/create-checkout", (req, res) => {
  res.status(410).json({
    error: "deprecated",
    message: "Use /api/checkout on the Next.js app",
    studioUrl: `${SITE}/studio`,
  });
});

module.exports = router;
