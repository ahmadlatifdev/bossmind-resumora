import styles from "@/styles/luxury/landing.module.css";

const TESTIMONIALS = [
  {
    quote:
      "Resumora transformed my executive narrative into a board-ready profile. The polish felt bespoke, not templated.",
    author: "Amelia Chen",
    role: "VP Strategy, Global SaaS",
  },
  {
    quote:
      "Bilingual delivery was flawless. Our leadership team finally has CVs that match the caliber of our brand.",
    author: "Marc Dubois",
    role: "Directeur RH, Montréal",
  },
  {
    quote:
      "Enterprise-grade discretion, fast turnaround, and AI precision. This is the luxury standard for career assets.",
    author: "Jordan Ellis",
    role: "Chief People Officer",
  },
];

export default function TestimonialsSection() {
  return (
    <section id="testimonials" className="lux-section">
      <div className="lux-container">
        <header className={styles.sectionHeader}>
          <span className={styles.sectionEyebrow}>Testimonials</span>
          <h2 className={styles.sectionTitle}>Trusted by executive leaders</h2>
          <p className={styles.sectionDesc}>
            Production-safe social proof foundation for the Resumora luxury homepage.
          </p>
        </header>

        <div className={styles.testimonialGrid}>
          {TESTIMONIALS.map((item) => (
            <article key={item.author} className={`lux-glass ${styles.testimonialCard}`}>
              <p className={styles.quote}>&ldquo;{item.quote}&rdquo;</p>
              <div>
                <div className={styles.author}>{item.author}</div>
                <div className={styles.role}>{item.role}</div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
