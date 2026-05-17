import { useLanguage } from "@/context/LanguageContext";
import { translations } from "@/lib/marketing/site-copy";

export default function TrustAuthorityStrip({ variant = "hero" }) {
  const { lang } = useLanguage();
  const t = translations[lang];
  const items = t.trustAuthorityBadges || [];

  if (!items.length) return null;

  return (
    <ul className={`rs-trust-authority rs-trust-authority--${variant}`} aria-label={t.trustAuthorityLabel}>
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}
