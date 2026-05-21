import Link from "next/link";

const L = (lang, en, fr) => (lang === "fr" ? fr : en);

export default function StudioCheckoutSync({
  lang = "en",
  progressPercent = 0,
  attempt = 0,
  needsSignIn = false,
  signInHref = "/login",
  onAssist,
}) {
  const pct = Math.min(96, Math.max(8, progressPercent || Math.min(92, 20 + attempt * 3)));

  return (
    <div className="rs-studio-checkout-sync" role="status" aria-live="polite" data-rs-studio-checkout-sync="1">
      <div className="rs-studio-checkout-sync-inner">
        <div className="rs-studio-checkout-sync-copy">
          <span className="rs-studio-checkout-sync-eyebrow">
            {L(lang, "Resumora Executive Studio", "Studio executif Resumora")}
          </span>
          <strong className="rs-studio-checkout-sync-title">
            {L(lang, "Payment confirmed", "Paiement confirme")}
          </strong>
          <span className="rs-studio-checkout-sync-sub">
            {needsSignIn
              ? L(lang, "Sign in to open your workspace.", "Connectez-vous pour ouvrir votre espace.")
              : L(lang, "Syncing your secure workspace…", "Synchronisation de votre espace securise…")}
          </span>
        </div>
        <div className="rs-studio-checkout-sync-meter" aria-hidden="true">
          <div className="rs-studio-checkout-sync-meter-fill" style={{ width: `${pct}%` }} />
        </div>
        <div className="rs-studio-checkout-sync-actions">
          {needsSignIn ? (
            <Link href={signInHref} className="rs-btn-accent rs-btn-accent--compact">
              {L(lang, "Sign in", "Connexion")}
            </Link>
          ) : (
            <span className="rs-studio-checkout-sync-pulse">
              {L(lang, "Auto-sync active", "Synchronisation automatique")}
            </span>
          )}
          {onAssist ? (
            <button type="button" className="rs-link-quiet" onClick={onAssist}>
              {L(lang, "Assist", "Aide")}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
