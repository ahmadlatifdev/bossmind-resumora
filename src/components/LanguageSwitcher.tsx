import React from "react";
import { LANGS, t } from "../lib/i18n.js";

export default function LanguageSwitcher({ lang, onChange, className = "" }) {
  return (
    <div className={`lang-toggle ${className}`.trim()} role="group" aria-label="Language">
      {LANGS.map((code) => (
        <button
          key={code}
          type="button"
          className="lang-btn"
          data-active={lang === code}
          aria-pressed={lang === code}
          aria-label={t(lang, `lang.${code}`)}
          onClick={() => onChange(code)}
        >
          {t(lang, `lang.${code}`)}
        </button>
      ))}
    </div>
  );
}
