import { ChevronDown, Globe2 } from "lucide-react";
import { useState } from "react";
import { regionGroups } from "@/lib/data/regions-marketing";
import { REGION_ICONS, translations } from "@/lib/marketing/site-copy";
import { useLanguage } from "@/context/LanguageContext";

export default function RegionsPanel() {
  const { lang } = useLanguage();
  const t = translations[lang];
  const regions = regionGroups[lang];
  const [openRegionId, setOpenRegionId] = useState(regions[0]?.id ?? "");

  return (
    <section id="countries" className="rs-section">
      <div className="rs-container">
        <p className="rs-eyebrow">{t.navCountries}</p>
        <h2 className="rs-h2">{t.countriesTitle}</h2>
        <p className="rs-subtitle">{t.countriesSubtitle}</p>
        <p className="rs-regions-hint">{t.regionsToggleHint}</p>
        <div className="rs-region-groups">
          {regions.map((region) => {
            const Icon = REGION_ICONS[region.id] || Globe2;
            const open = openRegionId === region.id;
            return (
              <div key={region.id} className="rs-region-shell">
                <button
                  type="button"
                  className="rs-region-trigger"
                  aria-expanded={open}
                  onClick={() => setOpenRegionId((cur) => (cur === region.id ? "" : region.id))}
                >
                  <span className="rs-region-trigger-main">
                    <Icon className="rs-icon-gold" size={22} strokeWidth={1.45} aria-hidden />
                    <span className="rs-region-title">{region.title}</span>
                  </span>
                  <span className="rs-region-summary">{region.summary}</span>
                  <ChevronDown size={22} className="rs-region-chevron" data-open={open ? "true" : "false"} aria-hidden />
                </button>
                {open ? (
                  <div className="rs-region-panel">
                    <div className="rs-region-grid">
                      {region.countries.map((c) => (
                        <article key={`${region.id}-${c.country}`} className="rs-region-card">
                          <div className="rs-region-name">{c.country}</div>
                          <div className="rs-region-standard">{c.standard}</div>
                          <p className="rs-region-desc">{c.line}</p>
                        </article>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
