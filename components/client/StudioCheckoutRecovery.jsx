const L = (lang, en, fr) => (lang === "fr" ? fr : en);

/** Single recovery surface — one message, one action. No technical steps exposed. */
export default function StudioCheckoutRecovery({ lang = "en", onContinue, busy = false }) {
  return (
    <div className="rs-studio-checkout-recovery" role="alert">
      <p className="rs-studio-checkout-recovery-message">
        {L(
          lang,
          "We're finalizing your workspace. Please continue securely.",
          "Nous finalisons votre espace. Veuillez continuer en toute securite."
        )}
      </p>
      <button type="button" className="rs-btn-accent" onClick={onContinue} disabled={busy}>
        {L(lang, "Continue to Workspace", "Continuer vers l'espace")}
      </button>
    </div>
  );
}
