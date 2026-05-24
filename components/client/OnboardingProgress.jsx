// ── Presentation-only refinement. Props and data contract unchanged.
export default function OnboardingProgress({ steps, percent, lang = "en" }) {
  const done  = steps.filter((s) => s.done).length;
  const total = steps.length;

  return (
    <div className="rs-onboarding-progress rs-onboarding-progress--v2" data-rs-onboarding="1">
      <div className="rs-onboarding-progress__header">
        <span className="rs-onboarding-progress__label">
          {lang === "fr" ? "Progression" : "Intake progress"}
        </span>
        <span className="rs-onboarding-progress__counter">
          <strong>{done}</strong>/{total}
        </span>
        <span className="rs-onboarding-progress__pct">{percent}%</span>
      </div>

      <div className="rs-onboarding-bar" aria-hidden="true">
        <div className="rs-onboarding-bar-fill" style={{ width: `${percent}%` }} />
      </div>

      <ol className="rs-onboarding-steps rs-onboarding-steps--v2">
        {steps.map((s) => (
          <li key={s.key} className={s.done ? "is-done" : ""}>
            <span className="rs-onboarding-dot" aria-hidden>
              {s.done ? (
                <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                  <circle cx="5.5" cy="5.5" r="5" fill="rgba(76,175,80,0.18)" stroke="rgba(76,175,80,0.5)" strokeWidth="1"/>
                  <path d="M3 5.5l1.8 1.8L8 3.5" stroke="#9ee8b8" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              ) : (
                <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                  <circle cx="5.5" cy="5.5" r="5" stroke="rgba(255,255,255,0.15)" strokeWidth="1"/>
                </svg>
              )}
            </span>
            <span>{s.label}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
