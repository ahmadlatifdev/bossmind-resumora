import styles from "@/styles/luxury/footer.module.css";

const PRODUCT_LINKS = [
  { href: "#hero", label: "Platform" },
  { href: "#testimonials", label: "Success Stories" },
  { href: "#faq", label: "FAQ" },
];

const COMPANY_LINKS = [
  { href: "#", label: "About" },
  { href: "#", label: "Contact" },
  { href: "#", label: "Privacy" },
];

export default function LuxuryFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className={styles.footer}>
      <div className="lux-container">
        <div className={styles.footerGrid}>
          <div className={styles.brandBlock}>
            <div className={styles.footerBrand}>
              <span className={styles.brandMark} aria-hidden="true" />
              <span>Resumora</span>
            </div>
            <p className={styles.footerDesc}>
              AI-powered executive resume intelligence for enterprise professionals.
              Luxury delivery, bilingual excellence, production-grade trust.
            </p>
          </div>

          <div>
            <h3 className={styles.columnTitle}>Product</h3>
            <ul className={styles.linkList}>
              {PRODUCT_LINKS.map((link) => (
                <li key={link.label}>
                  <a href={link.href} className={styles.footerLink}>
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className={styles.columnTitle}>Company</h3>
            <ul className={styles.linkList}>
              {COMPANY_LINKS.map((link) => (
                <li key={link.label}>
                  <a href={link.href} className={styles.footerLink}>
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className={styles.footerBottom}>
          <span>© {year} Resumora. All rights reserved.</span>
          <span>Enterprise AI · EN / FR</span>
        </div>
      </div>
    </footer>
  );
}
