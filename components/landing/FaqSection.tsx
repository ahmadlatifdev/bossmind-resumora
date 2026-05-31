"use client";

import { useState } from "react";

import { useLanguage } from "@/context/LanguageContext";
import { getFaqItems, getMarketingMessages } from "@/lib/i18n/marketing-messages";
import styles from "@/styles/luxury/landing.module.css";

export default function FaqSection() {
  const { lang } = useLanguage();
  const locale = lang === "fr" ? "fr" : "en";
  const messages = getMarketingMessages(locale);
  const items = getFaqItems(locale);
  const [openId, setOpenId] = useState<string | null>(items[0]?.id ?? null);

  return (
    <section id="faq" className="lux-section">
      <div className="lux-container">
        <header className={styles.sectionHeader}>
          <span className={styles.sectionEyebrow}>FAQ</span>
          <h2 className={styles.sectionTitle}>{messages.faq.sectionTitle}</h2>
        </header>

        <div className={styles.faqList}>
          {items.map((item) => {
            const open = openId === item.id;
            return (
              <article key={item.id} className={`lux-glass ${styles.faqItem}`}>
                <button
                  type="button"
                  className={styles.faqQuestion}
                  aria-expanded={open}
                  onClick={() => setOpenId(open ? null : item.id)}
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
