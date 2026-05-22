import { useLanguage } from "@/context/LanguageContext";
import { translations } from "@/lib/marketing/site-copy";

/** Minimal three-step studio flow — title + one short line. */
export default function ExecutiveFlowStrip() {
  const { lang } = useLanguage();
  const t = translations[lang];
  const steps = t.executiveFlowSteps || [];

  if (!steps.length) return null;

  return (
    <section className="rs-section rs-section--flow" aria-label={t.executiveFlowLabel}>
      <div className="rs-container">
        <ol className="rs-executive-flow rs-executive-flow--minimal">
          {steps.map((step) => (
            <li key={step.title} className="rs-executive-flow-step">
              <h3 className="rs-executive-flow-title">{step.title}</h3>
              <p className="rs-executive-flow-line">{step.line}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
