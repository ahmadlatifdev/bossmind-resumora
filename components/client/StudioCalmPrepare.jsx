const L = (lang, en, fr) => (lang === "fr" ? fr : en);

/** Static, zero-rerender luxury prepare screen — no step pills or progress ticks. */
export default function StudioCalmPrepare({ lang = "en" }) {
  return (
    <div className="rs-studio-calm-prepare" role="status" aria-live="polite">
      <p className="rs-studio-calm-prepare-eyebrow">
        {L(lang, "Resumora Executive Studio", "Studio executif Resumora")}
      </p>
      <h2 className="rs-studio-calm-prepare-title">
        {L(lang, "Preparing your secure Resumora workspace…", "Preparation de votre espace securise Resumora…")}
      </h2>
      <div className="rs-studio-calm-prepare-bar" aria-hidden="true">
        <span className="rs-studio-calm-prepare-bar-fill" />
      </div>
    </div>
  );
}
