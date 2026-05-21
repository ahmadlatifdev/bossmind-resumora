import Link from "next/link";

const STEPS = [
  { key: "payment", en: "Confirming payment", fr: "Confirmation du paiement" },
  { key: "plan", en: "Activating your plan", fr: "Activation de votre forfait" },
  { key: "upload", en: "Preparing your upload workspace", fr: "Preparation de l'espace de televersement" },
  { key: "dashboard", en: "Creating your resume generation dashboard", fr: "Creation du tableau de bord CV" },
  { key: "edits", en: "Loading your free edits", fr: "Chargement de vos retouches gratuites" },
];

const L = (lang, en, fr) => (lang === "fr" ? fr : en);

function resolveSteps(lang, luxuryStages, activation, attempt, softExtended) {
  if (Array.isArray(luxuryStages) && luxuryStages.length) {
    return luxuryStages.map((s, i) => {
      const done = Boolean(s.done);
      let active = Boolean(s.active);
      if (softExtended && i === 4 && !done) active = true;
      return {
        key: s.key,
        label:
          s.label ||
          (lang === "fr" ? STEPS.find((x) => x.key === s.key)?.fr : STEPS.find((x) => x.key === s.key)?.en) ||
          s.key,
        done,
        active,
      };
    });
  }
  return STEPS.map((step, i) => {
    const flags = [
      activation?.paymentConfirmed,
      activation?.planActivated,
      activation?.workspaceReady,
      activation?.uploadsUnlocked,
      activation?.generationReady,
    ];
    const done = Boolean(flags[i]) || attempt > i + 1;
    let active = !done && (attempt === i + 1 || (attempt === 0 && i === 0));
    if (softExtended && i === 4 && !done) active = true;
    return {
      key: step.key,
      label: lang === "fr" ? step.fr : step.en,
      done,
      active,
    };
  });
}

export default function PostPaymentActivation({
  lang = "en",
  attempt = 0,
  activation = null,
  luxuryStages = null,
  conciergeMessage = "",
  progressPercent = null,
  softExtended = false,
  needsSignIn = false,
  signInHref = "/login",
  failed = false,
  onRecover,
  recoveryEmail = "",
  onRecoveryEmailChange,
  onEmailRecover,
}) {
  const useSoft = softExtended && !failed;
  const steps = resolveSteps(lang, luxuryStages, activation, attempt, useSoft);
  const pct =
    typeof progressPercent === "number"
      ? progressPercent
      : Math.min(useSoft ? 92 : 100, Math.round((steps.filter((s) => s.done).length / steps.length) * 100));

  const headline = failed
    ? L(
        lang,
        "We could not complete automatic activation yet. Please click Recover Purchase.",
        "Nous n'avons pas pu terminer l'activation automatique. Cliquez sur Recuperer l'achat."
      )
    : useSoft
      ? L(
          lang,
          "Payment confirmed. Still securing your Resumora workspace...",
          "Paiement confirme. Securisation de votre espace Resumora en cours..."
        )
      : L(
          lang,
          "Payment confirmed. Preparing your secure Resumora workspace...",
          "Paiement confirme. Preparation de votre espace securise Resumora..."
        );

  const concierge =
    conciergeMessage ||
    L(
      lang,
      useSoft
        ? "Your AI concierge is completing verification with Stripe — no action needed."
        : "Your AI concierge is orchestrating workspace preparation in the background.",
      useSoft
        ? "Votre concierge IA termine la verification avec Stripe — aucune action requise."
        : "Votre concierge IA prepare votre espace en arriere-plan."
    );

  return (
    <section
      className={`rs-post-payment-activation${failed ? " rs-post-payment-activation--failed" : ""}${useSoft ? " rs-post-payment-activation--extended" : ""}`}
      data-rs-post-payment-activation="1"
      aria-live="polite"
    >
      <div className="rs-post-payment-activation-card rs-post-payment-activation-card--enter">
        <p className="rs-post-payment-activation-eyebrow">
          {L(lang, "Resumora Executive Studio", "Studio executif Resumora")}
        </p>
        <h1 className="rs-post-payment-activation-title">{headline}</h1>
        {!failed ? (
          <>
            <p className="rs-post-payment-activation-sub">
              {L(
                lang,
                "Please wait a moment while we unlock your plan automatically.",
                "Veuillez patienter pendant le deverrouillage automatique de votre forfait."
              )}
            </p>
            <p className="rs-post-payment-activation-concierge">{concierge}</p>
          </>
        ) : null}

        {needsSignIn && !failed ? (
          <p className="rs-post-payment-activation-signin">
            {L(
              lang,
              "Sign in with the same email you used at checkout to open your workspace.",
              "Connectez-vous avec le courriel utilise au paiement pour ouvrir votre espace."
            )}{" "}
            <Link href={signInHref} className="rs-post-payment-activation-signin-link">
              {L(lang, "Sign in now", "Se connecter")}
            </Link>
          </p>
        ) : null}

        <ol className="rs-post-payment-activation-steps">
          {steps.map((step) => (
            <li
              key={step.key}
              className={[step.done ? "is-done" : "", step.active ? "is-active" : ""].filter(Boolean).join(" ")}
            >
              <span className="rs-post-payment-step-icon" aria-hidden="true">
                {step.done ? "✓" : step.active ? "◉" : "○"}
              </span>
              <span>{step.label}</span>
            </li>
          ))}
        </ol>

        {!failed ? (
          <div className="rs-post-payment-activation-progress" aria-hidden="true">
            <div className="rs-post-payment-activation-progress-fill" style={{ width: `${pct}%` }} />
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
          </div>
        ) : (
          <p className="rs-post-payment-activation-hint">
            <span className="rs-post-payment-activation-pulse" aria-hidden="true" />
            {L(lang, "Automatic setup in progress", "Configuration automatique en cours")}
          </p>
        )}

        {useSoft && onRecover ? (
          <p className="rs-post-payment-activation-soft-recover">
            <button type="button" className="rs-link-quiet" onClick={onRecover}>
              {L(lang, "Having trouble? Retry secure sync", "Un souci? Relancer la synchronisation")}
            </button>
          </p>
        ) : null}

        {failed ? (
          <div className="rs-checkout-recovery">
            <label>
              {L(lang, "Recover with checkout email", "Recuperer avec le courriel de paiement")}
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
