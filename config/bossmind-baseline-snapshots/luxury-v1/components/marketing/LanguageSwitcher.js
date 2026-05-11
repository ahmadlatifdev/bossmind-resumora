import { useLanguage } from "@/context/LanguageContext";
import { translations } from "@/lib/marketing/site-copy";

/**
 * Luxury minimal EN/FR toggle — use site-wide (top bar, minimal chrome, optional footer).
 * @param {{ variant?: "segmented" | "compact" }} props
 */
export default function LanguageSwitcher({ variant = "segmented" }) {
  const { lang, setLang } = useLanguage();
  const t = translations[lang];
  const compact = variant === "compact";
  const rootClass = ["rs-lang-switcher", compact ? "rs-lang-switcher--compact" : ""].filter(Boolean).join(" ");

  return (
    <div className={rootClass} role="group" aria-label={t.langSwitcherAria}>
      <button
        type="button"
        className="rs-lang-switcher__btn"
        data-active={lang === "en" ? "true" : "false"}
        onClick={() => setLang("en")}
        aria-pressed={lang === "en"}
        aria-label={t.langEnglish}
      >
        EN
      </button>
      <button
        type="button"
        className="rs-lang-switcher__btn"
        data-active={lang === "fr" ? "true" : "false"}
        onClick={() => setLang("fr")}
        aria-pressed={lang === "fr"}
        aria-label={t.langFrench}
      >
        FR
      </button>
    </div>
  );
}
