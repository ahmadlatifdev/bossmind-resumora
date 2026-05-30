"use client";

import { useState } from "react";

import styles from "@/styles/luxury/landing.module.css";

const FAQ_ITEMS = [
  {
    question: "What makes Resumora an enterprise-grade resume platform?",
    answer:
      "Resumora combines AI-assisted optimization with luxury editorial standards, bilingual delivery, and production-safe workflows designed for executive clients.",
  },
  {
    question: "Do you support English and French?",
    answer:
      "Yes. EN/FR toggle placeholder UI is included in this foundation. Full i18n wiring will connect to the existing language system in a later task.",
  },
  {
    question: "Is this homepage mobile optimized?",
    answer:
      "Yes. Layout uses fluid typography, stacked CTAs on small screens, collapsible navigation, and single-column testimonial and FAQ grids below 768px.",
  },
  {
    question: "How do I get started?",
    answer:
      "Use the primary CTA in the hero section. Checkout and registration flows remain unchanged in this foundation-only task.",
  },
];

export default function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section id="faq" className="lux-section">
      <div className="lux-container">
        <header className={styles.sectionHeader}>
          <span className={styles.sectionEyebrow}>FAQ</span>
          <h2 className={styles.sectionTitle}>Questions, answered with clarity</h2>
          <p className={styles.sectionDesc}>
            Lightweight accordion foundation for luxury SaaS conversion support.
          </p>
        </header>

        <div className={styles.faqList}>
          {FAQ_ITEMS.map((item, index) => {
            const open = openIndex === index;
            return (
              <article key={item.question} className={`lux-glass ${styles.faqItem}`}>
                <button
                  type="button"
                  className={styles.faqQuestion}
                  aria-expanded={open}
                  onClick={() => setOpenIndex(open ? null : index)}
                >
                  <span>{item.question}</span>
                  <span aria-hidden="true">{open ? "−" : "+"}</span>
                </button>
                {open ? <p className={styles.faqAnswer}>{item.answer}</p> : null}
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
