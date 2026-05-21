import Link from "next/link";
import { useState } from "react";

const STEPS = [
  { key: "payment", en: "Confirming payment", fr: "Confirmation du paiement" },
  { key: "plan", en: "Activating your plan", fr: "Activation de votre forfait" },
  { key: "upload", en: "Preparing your upload workspace", fr: "Preparation de l'espace de televersement" },
  { key: "dashboard", en: "Creating your resume generation dashboard", fr: "Creation du tableau de bord CV" },
  { key: "edits", en: "Loading your free edits", fr: "Chargement de vos retouches gratuites" },
];

const L = (lang, en, fr) => (lang === "fr" ? fr : en);

function resolveSteps(lang, luxuryStages, activation, attempt) {
  const flags = [
    activation?.paymentConfirmed,
    activation?.planActivated,
    activation?.workspaceReady,
    activation?.uploadsUnlocked,
    activation?.generationReady,
  ];
  const hasApiFlags = flags.some(Boolean);

  if (Array.isArray(luxuryStages) && luxuryStages.length && hasApiFlags) {
    return luxuryStages.map((s, i) => ({
      key: s.key,
      label:
        s.label ||
        (lang === "fr" ? STEPS.find((x) => x.key === s.key)?.fr : STEPS.find((x) => x.key === s.key)?.en) ||
        s.key,
      done: Boolean(s.done),
      active: Boolean(s.active),
    }));
  }

  const momentum = Math.max(0, attempt);
  return STEPS.map((step, i) => {
    const done = Boolean(flags[i]) || momentum > i + 1;
    const active = !done && (momentum === i + 1 || (momentum === 0 && i === 0) || (momentum >= 4 && i === 4 && !done));
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
  needsSignIn = false,
  signInHref = "/login",
  onRecover,
  recoveryEmail = "",
  onRecoveryEmailChange,
  onEmailRecover,
}) {
  const [showAssist, setShowAssist] = useState(false);
  const steps = resolveSteps(lang, luxuryStages, activation, attempt);
  const doneCount = steps.filter((s) => s.done).length;
  const pct =
    typeof progressPercent === "number"
      ? Math.max(progressPercent, Math.round((doneCount / steps.length) * 100))
      : Math.min(96, Math.max(12, Math.round((doneCount / steps.length) * 100) + Math.min(attempt * 2, 20)));

  const headline = L(
    lang,
    attempt >= 8
      ? "Payment confirmed. Still securing your Resumora workspace..."
      : "Payment confirmed. Preparing your secure Resumora workspace...",
    attempt >= 8
      ? "Paiement confirme. Securisation de votre espace Resumora en cours..."
      : "Paiement confirme. Preparation de votre espace securise Resumora..."
  );

  const concierge =
    conciergeMessage ||
    L(
      lang,
      needsSignIn
        ? "Your purchase is verified. Sign in with your checkout email to unlock your studio instantly."
        : attempt >= 6
          ? "Your AI concierge is completing verification with Stripe — no action needed."
          : "Your AI concierge is orchestrating workspace preparation in the background.",
      needsSignIn
        ? "Votre achat est verifie. Connectez-vous avec votre courriel de paiement pour debloquer le studio."
        : attempt >= 6
          ? "Votre concierge IA termine la verification avec Stripe — aucune action requise."
          : "Votre concierge IA prepare votre espace en arriere-plan."
    );

  return (
    <section
      className="rs-post-payment-activation rs-post-payment-activation--extended"
      data-rs-post-payment-activation="1"
      aria-live="polite"
    >
      <div className="rs-post-payment-activation-card rs-post-payment-activation-card--enter">
        <p className="rs-post-payment-activation-eyebrow">
          {L(lang, "Resumora Executive Studio", "Studio executif Resumora")}
        </p>
        <h1 className="rs-post-payment-activation-title">{headline}</h1>
        <p className="rs-post-payment-activation-sub">
          {L(
            lang,
            "Please wait a moment while we unlock your plan automatically.",
            "Veuillez patienter pendant le deverrouillage automatique de votre forfait."
          )}
        </p>
        <p className="rs-post-payment-activation-concierge">{concierge}</p>

        {needsSignIn ? (
          <div className="rs-post-payment-activation-signin-cta">
            <Link href={signInHref} className="rs-btn-accent">
              {L(lang, "Sign in with checkout email", "Connexion (courriel de paiement)")}
            </Link>
          </div>
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

        <div className="rs-post-payment-activation-progress" aria-hidden="true">
          <div className="rs-post-payment-activation-progress-fill" style={{ width: `${pct}%` }} />
        </div>

        <p className="rs-post-payment-activation-hint">
          <span className="rs-post-payment-activation-pulse" aria-hidden="true" />
          {L(lang, "Automatic setup in progress", "Configuration automatique en cours")}
        </p>

        {attempt >= 12 ? (
          <p className="rs-post-payment-activation-soft-recover">
            {!showAssist ? (
              <button type="button" className="rs-link-quiet" onClick={() => setShowAssist(true)}>
                {L(lang, "Need assistance linking your purchase?", "Besoin d'aide pour lier votre achat?")}
              </button>
            ) : (
              <button type="button" className="rs-link-quiet" onClick={onRecover}>
                {L(lang, "Retry secure sync", "Relancer la synchronisation securisee")}
              </button>
            )}
          </p>
        ) : null}

        {showAssist ? (
          <div className="rs-checkout-recovery rs-checkout-recovery--assist">
            <label>
              {L(lang, "Checkout email (optional)", "Courriel de paiement (optionnel)")}
              <input
                className="rs-input"
                type="email"
                value={recoveryEmail}
                onChange={(e) => onRecoveryEmailChange?.(e.target.value)}
                placeholder={L(lang, "you@email.com", "vous@courriel.com")}
              />
            </label>
            <button type="button" className="rs-btn-ghost" onClick={onEmailRecover}>
              {L(lang, "Sync purchase", "Synchroniser l'achat")}
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
