export default function OnboardingProgress({ steps, percent, lang = "en" }) {
  return (
    <div className="rs-onboarding-progress" data-rs-onboarding="1">
      <p className="rs-onboarding-progress-title">
        {lang === "fr" ? "Progression" : "Progress"}: <strong>{percent}%</strong>
      </p>
      <div className="rs-onboarding-bar" aria-hidden="true">
        <div className="rs-onboarding-bar-fill" style={{ width: `${percent}%` }} />
      </div>
      <ol className="rs-onboarding-steps">
        {steps.map((s) => (
          <li key={s.key} className={s.done ? "is-done" : ""}>
            <span className="rs-onboarding-dot">{s.done ? "✓" : "○"}</span>
            <span>{s.label}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
