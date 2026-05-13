/**
 * Live HTML checks for Resumora footer drift (stale deploy / CDN / wrong branch).
 * Used by bossmind-immutable-verify and bossmind-task-completion-gate production probes.
 */

const FORBIDDEN_SNIPPETS = [
  { id: "trust_chips_row", test: (s) => s.includes("rs-footer-trust-chips") },
  { id: "trust_chip_token", test: (s) => s.includes("rs-footer-trust-chip") },
  { id: "engage_head_block", test: (s) => s.includes("rs-footer-engage-head") },
  { id: "neon_rollup_en", test: (s) => /Connect\s+Neon\s+for\s+live\s+engagement\s+rollups/i.test(s) },
  { id: "neon_rollup_fr", test: (s) => /Connectez\s+Neon\s+pour\s+les\s+agrégats/i.test(s) },
  { id: "trust_signals_title_en", test: (s) => /Trust\s*&\s*signals/i.test(s) },
  { id: "trust_signals_title_fr", test: (s) => /Confiance\s*&\s*signaux/i.test(s) },
];

const REQUIRED_SNIPPETS = [
  {
    id: "footer_toolbar_aria_en_or_fr",
    test: (s) =>
      s.includes('aria-label="Resumora quick actions"') ||
      s.includes("aria-label=\"Actions rapides Resumora\"") ||
      s.includes("aria-label=&#x27;Actions rapides Resumora&#x27;"),
  },
  { id: "official_social_anchor", test: (s) => s.includes('id="footer-official-social"') },
  { id: "cta_pill_class", test: (s) => s.includes("rs-foot-engage-v2") },
];

/**
 * @param {string} html
 * @returns {{ ok: boolean, violations: string[], missing: string[] }}
 */
function assertApprovedFooterInHtml(html) {
  const s = String(html || "");
  const violations = [];
  for (const f of FORBIDDEN_SNIPPETS) {
    try {
      if (f.test(s)) violations.push(f.id);
    } catch {
      violations.push(`${f.id}_error`);
    }
  }
  const missing = [];
  for (const r of REQUIRED_SNIPPETS) {
    try {
      if (!r.test(s)) missing.push(r.id);
    } catch {
      missing.push(`${r.id}_error`);
    }
  }
  return {
    ok: violations.length === 0 && missing.length === 0,
    violations,
    missing,
  };
}

module.exports = {
  assertApprovedFooterInHtml,
  FORBIDDEN_SNIPPETS,
  REQUIRED_SNIPPETS,
};
