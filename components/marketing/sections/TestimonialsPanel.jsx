import { testimonialsList, translations } from "@/lib/marketing/site-copy";
import { useLanguage } from "@/context/LanguageContext";

export default function TestimonialsPanel() {
  const { lang } = useLanguage();
  const t = translations[lang];
  const quotes = testimonialsList(lang);

  return (
    <section id="testimonials" className="rs-section rs-section-muted">
      <div className="rs-container">
        <p className="rs-eyebrow">{t.navTestimonials}</p>
        <h2 className="rs-h2">{t.testimonialsTitle}</h2>
        <p className="rs-subtitle">{t.testimonialsSubtitle}</p>
        <div className="rs-card-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
          {quotes.map((q) => (
            <blockquote key={q.author} className="rs-quote-card">
              <p className="rs-quote">&ldquo;{q.quote}&rdquo;</p>
              <footer className="rs-quote-author">
                {q.author}
                <span style={{ display: "block", fontWeight: 500, color: "var(--rs-text-muted)", marginTop: "0.2rem" }}>{q.role}</span>
              </footer>
            </blockquote>
          ))}
        </div>
      </div>
    </section>
  );
}
