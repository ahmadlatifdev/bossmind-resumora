import { useLanguage } from "@/context/LanguageContext";
import { translations } from "@/lib/marketing/site-copy";

/** Lightweight authority → transformation narrative (replaces dense trust blocks). */
export default function ExecutiveFlowStrip() {
  const { lang } = useLanguage();
  const t = translations[lang];
  const steps = t.executiveFlowSteps || [];

  if (!steps.length) return null;

  return (
    <section className="rs-section rs-section--flow" aria-label={t.executiveFlowLabel}>
      <div className="rs-container">
        <ol className="rs-executive-flow">
          {steps.map((step, i) => (
            <li key={step.title} className="rs-executive-flow-step" style={{ "--rs-flow-i": i }}>
              <span className="rs-executive-flow-index">{String(i + 1).padStart(2, "0")}</span>
              <div>
                <h3 className="rs-executive-flow-title">{step.title}</h3>
                <p className="rs-executive-flow-line">{step.line}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
