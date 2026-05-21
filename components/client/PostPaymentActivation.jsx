import Link from "next/link";

const STEPS = [
  { key: "payment", en: "Confirming payment", fr: "Confirmation du paiement" },
  { key: "plan", en: "Activating your plan", fr: "Activation de votre forfait" },
  { key: "upload", en: "Preparing your upload workspace", fr: "Preparation de l'espace de televersement" },
  { key: "dashboard", en: "Creating your resume generation dashboard", fr: "Creation du tableau de bord CV" },
  { key: "edits", en: "Loading your free edits", fr: "Chargement de vos retouches gratuites" },
];

const L = (lang, en, fr) => (lang === "fr" ? fr : en);

function stepDone(index, attempt, activation, failed) {
  if (failed) return false;
  if (activation?.generationReady) return true;
  if (attempt > index + 1) return true;
  if (activation) {
    const flags = [
      activation.paymentConfirmed,
      activation.planActivated,
      activation.workspaceReady,
      activation.uploadsUnlocked,
      activation.generationReady,
    ];
    if (flags[index]) return true;
  }
  return attempt > index;
}

export default function PostPaymentActivation({
  lang = "en",
  attempt = 0,
  maxAttempts = 5,
  activation = null,
  failed = false,
  onRecover,
  recoveryEmail = "",
  onRecoveryEmailChange,
  onEmailRecover,
}) {
  const headline = failed
    ? L(
        lang,
        "We could not complete automatic activation yet. Please click Recover Purchase.",
        "Nous n'avons pas pu terminer l'activation automatique. Cliquez sur Recuperer l'achat."
      )
    : L(
        lang,
        "Payment confirmed. Preparing your secure Resumora workspace...",
        "Paiement confirme. Preparation de votre espace securise Resumora..."
      );

  return (
    <section className="rs-post-payment-activation" data-rs-post-payment-activation="1" aria-live="polite">
      <div className="rs-post-payment-activation-card">
        <p className="rs-post-payment-activation-eyebrow">
          {L(lang, "Resumora Executive Studio", "Studio executif Resumora")}
        </p>
        <h1 className="rs-post-payment-activation-title">{headline}</h1>
        {!failed ? (
          <p className="rs-post-payment-activation-sub">
            {L(
              lang,
              "Please wait a moment while we unlock your plan automatically.",
              "Veuillez patienter pendant le deverrouillage automatique de votre forfait."
            )}
          </p>
        ) : null}

        <ol className="rs-post-payment-activation-steps">
          {STEPS.map((step, i) => {
            const done = stepDone(i, attempt, activation, failed);
            const active = !failed && attempt === i + 1;
            return (
              <li
                key={step.key}
                className={[done ? "is-done" : "", active ? "is-active" : ""].filter(Boolean).join(" ")}
              >
                <span className="rs-post-payment-step-icon" aria-hidden="true">
                  {done ? "✓" : active ? "◉" : "○"}
                </span>
                <span>{lang === "fr" ? step.fr : step.en}</span>
              </li>
            );
          })}
        </ol>

        {!failed ? (
          <div className="rs-post-payment-activation-progress" aria-hidden="true">
            <div
              className="rs-post-payment-activation-progress-fill"
              style={{ width: `${Math.min(100, Math.round((attempt / maxAttempts) * 100))}%` }}
            />
          </div>
        ) : null}

        {failed ? (
          <div className="rs-post-payment-activation-actions">
            <button type="button" className="rs-btn-accent" onClick={onRecover}>
              {L(lang, "Recover Purchase", "Recuperer l'achat")}
            </button>
            <Link href="/studio" className="rs-btn-ghost">
              {L(lang, "Open My Secure Workspace", "Ouvrir mon espace securise")}
            </Link>
            <Link href="/pricing#pricing" className="rs-btn-ghost">
              {L(lang, "Choose a Plan", "Choisir un forfait")}
            </Link>
          </div>
        ) : (
          <p className="rs-post-payment-activation-hint">
            {L(lang, "Automatic setup in progress", "Configuration automatique en cours")}
            {attempt > 0 ? ` · ${attempt}/${maxAttempts}` : ""}
          </p>
        )}

        {failed ? (
          <div className="rs-checkout-recovery">
            <label>
              {L(lang, "Or recover with checkout email", "Ou recuperez avec le courriel de paiement")}
              <input
                className="rs-input"
                type="email"
                value={recoveryEmail}
                onChange={(e) => onRecoveryEmailChange?.(e.target.value)}
                placeholder={L(lang, "you@email.com", "vous@courriel.com")}
              />
            </label>
            <button type="button" className="rs-btn-ghost" onClick={onEmailRecover}>
              {L(lang, "Recover Purchase", "Recuperer l'achat")}
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
