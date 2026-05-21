const STEPS = [
  { key: "payment", en: "Payment", fr: "Paiement" },
  { key: "plan", en: "Plan", fr: "Forfait" },
  { key: "upload", en: "Upload", fr: "Televersement" },
  { key: "dashboard", en: "Dashboard", fr: "Tableau de bord" },
  { key: "edits", en: "Edits", fr: "Retouches" },
];

const L = (lang, en, fr) => (lang === "fr" ? fr : en);

function resolveSteps(lang, luxuryStages, activation, tick) {
  if (Array.isArray(luxuryStages) && luxuryStages.length) {
    return luxuryStages.map((s) => ({
      key: s.key,
      label: s.label || STEPS.find((x) => x.key === s.key)?.[lang === "fr" ? "fr" : "en"] || s.key,
      done: Boolean(s.done),
      active: Boolean(s.active),
    }));
  }
  const flags = [
    activation?.paymentConfirmed,
    activation?.planActivated,
    activation?.workspaceReady,
    activation?.uploadsUnlocked,
    activation?.generationReady,
  ];
  return STEPS.map((step, i) => ({
    key: step.key,
    label: lang === "fr" ? step.fr : step.en,
    done: Boolean(flags[i]) || tick > i + 1,
    active: !flags[i] && tick === i + 1,
  }));
}

export default function StudioLuxuryLoader({
  lang = "en",
  tick = 1,
  activation = null,
  luxuryStages = null,
  conciergeMessage = "",
  progressPercent = null,
  postCheckout = false,
}) {
  const steps = resolveSteps(lang, luxuryStages, activation, tick);
  const done = steps.filter((s) => s.done).length;
  const pct =
    typeof progressPercent === "number"
      ? progressPercent
      : Math.min(96, Math.round((done / steps.length) * 100) + Math.min(tick * 2, 24));

  const concierge =
    conciergeMessage ||
    L(
      lang,
      "Your AI concierge is preparing your executive workspace.",
      "Votre concierge IA prepare votre espace executif."
    );

  return (
    <div className="rs-studio-luxury-loader" role="status" aria-live="polite" data-rs-studio-luxury-loader="1">
      <p className="rs-studio-luxury-loader-eyebrow">
        {L(lang, "Resumora Executive Studio", "Studio executif Resumora")}
      </p>
      <h2 className="rs-studio-luxury-loader-title">
        {postCheckout
          ? L(lang, "Payment confirmed", "Paiement confirme")
          : L(lang, "Opening your workspace", "Ouverture de votre espace")}
      </h2>
      <p className="rs-studio-luxury-loader-concierge">{concierge}</p>
      <div className="rs-studio-luxury-loader-meter" aria-hidden="true">
        <div className="rs-studio-luxury-loader-meter-fill" style={{ width: `${pct}%` }} />
      </div>
      <ul className="rs-studio-luxury-loader-steps">
        {steps.map((s) => (
          <li
            key={s.key}
            className={[s.done ? "is-done" : "", s.active ? "is-active" : ""].filter(Boolean).join(" ")}
            title={s.label}
          >
            <span className="rs-studio-luxury-loader-step-dot" aria-hidden="true">
              {s.done ? "✓" : s.active ? "◉" : ""}
            </span>
            <span className="rs-studio-luxury-loader-step-label">{s.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
