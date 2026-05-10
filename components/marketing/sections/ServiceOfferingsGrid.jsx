import Link from "next/link";
import { useRouter } from "next/router";
import { ArrowRight, Bookmark, Heart, SlidersHorizontal } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import {
  compactQuoteForMetadata,
  computeServiceQuote,
  DEFAULT_SERVICE_CONFIG,
  mergeServiceConfig,
  QUOTE_STORAGE_KEY,
} from "@/lib/marketing/service-quote-pricing";
import { servicesByLang, translations } from "@/lib/marketing/site-copy";

function tierOptions(t) {
  return [
    { value: "basic", label: t.svcTierBasic },
    { value: "professional", label: t.svcTierProfessional },
    { value: "elite", label: t.svcTierElite },
  ];
}

export default function ServiceOfferingsGrid({ variant = "capabilities" }) {
  const { lang } = useLanguage();
  const t = translations[lang];
  const router = useRouter();
  const items = servicesByLang[lang];
  const [engStats, setEngStats] = useState(null);
  const [engBusy, setEngBusy] = useState(false);
  const [expandedKey, setExpandedKey] = useState(null);
  /** @type {Record<string, typeof DEFAULT_SERVICE_CONFIG>} */
  const [configs, setConfigs] = useState({});

  useEffect(() => {
    let c = false;
    fetch("/api/engagement/stats", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((d) => {
        if (!c) setEngStats(d);
      })
      .catch(() => {
        if (!c) setEngStats({ enabled: false });
      });
    return () => {
      c = true;
    };
  }, []);

  const getConfig = useCallback(
    (key) => configs[key] || DEFAULT_SERVICE_CONFIG,
    [configs]
  );

  const setConfigField = useCallback((key, partial) => {
    setConfigs((prev) => {
      const cur = mergeServiceConfig(prev[key] ? { ...prev[key] } : {});
      const next = { ...cur, ...partial };
      if (partial.addons) {
        next.addons = { ...cur.addons, ...partial.addons };
      }
      return { ...prev, [key]: mergeServiceConfig(next) };
    });
  }, []);

  const toggleExpand = (key) => {
    setExpandedKey((prev) => {
      const next = prev === key ? null : key;
      if (next && !configs[next]) {
        setConfigs((p) => ({ ...p, [next]: mergeServiceConfig({}) }));
      }
      return next;
    });
  };

  const quoteFor = useCallback(
    (key) => computeServiceQuote({ ...getConfig(key), serviceKey: key }),
    [getConfig]
  );

  const persistedConfig = expandedKey ? getConfig(expandedKey) : null;
  const liveQuote = expandedKey ? quoteFor(expandedKey) : null;

  useEffect(() => {
    if (typeof window === "undefined" || !expandedKey || !persistedConfig || !liveQuote) return;
    try {
      const bundle = {
        serviceKey: expandedKey,
        lang,
        config: persistedConfig,
        quote: liveQuote,
        metaCompact: compactQuoteForMetadata({
          serviceKey: expandedKey,
          lang,
          config: persistedConfig,
          quote: liveQuote,
        }),
      };
      sessionStorage.setItem(QUOTE_STORAGE_KEY, JSON.stringify(bundle));
    } catch {
      /* ignore */
    }
  }, [expandedKey, persistedConfig, liveQuote, lang]);

  const regionHint = () =>
    typeof navigator !== "undefined"
      ? `${navigator.language || ""}|${Intl.DateTimeFormat().resolvedOptions().timeZone || ""}`
      : "";

  const refreshEngagement = async () => {
    const r = await fetch("/api/engagement/stats", { credentials: "same-origin" });
    if (r.ok) setEngStats(await r.json());
  };

  const runEngagementAction = async (payload) => {
    if (engBusy) return;
    setEngBusy(true);
    try {
      const res = await fetch("/api/engagement/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ ...payload, regionHint: regionHint() }),
      });
      if (res.ok) await refreshEngagement();
      else if (res.status === 503) window.alert(t.engagementDisabled);
    } finally {
      setEngBusy(false);
    }
  };

  const goPricingWithQuote = () => {
    router.push("/pricing");
  };

  const persistStoredQuote = (resourceKey, pageCount) => {
    if (typeof window === "undefined") return;
    try {
      const cg = mergeServiceConfig({ ...getConfig(resourceKey), pageCount });
      const quote = computeServiceQuote({ ...cg, serviceKey: resourceKey });
      sessionStorage.setItem(
        QUOTE_STORAGE_KEY,
        JSON.stringify({
          serviceKey: resourceKey,
          lang,
          config: cg,
          quote,
          metaCompact: compactQuoteForMetadata({
            serviceKey: resourceKey,
            lang,
            config: cg,
            quote,
          }),
        })
      );
    } catch {
      /* ignore */
    }
  };

  const title = variant === "services" ? t.servicesTitle : t.capabilitiesTitle;
  const subtitle = variant === "services" ? t.servicesSubtitle : t.capabilitiesSubtitle;
  const eyebrow = variant === "services" ? t.navServices : t.navCapabilities;

  const pageOptions = useMemo(
    () => [
      { v: 1, label: t.svcPages1 },
      { v: 2, label: t.svcPages2 },
      { v: 3, label: t.svcPages3 },
      { v: 4, label: t.svcPages4 },
    ],
    [t]
  );

  return (
    <section id={variant === "services" ? "catalogue" : "capabilities"} className="rs-section">
      <div className="rs-container">
        <p className="rs-eyebrow">{eyebrow}</p>
        <h2 className="rs-h2">{title}</h2>
        <p className="rs-subtitle">{subtitle}</p>
        <div className={`rs-card-grid${variant === "capabilities" ? " rs-card-grid--compact" : ""}`}>
          {items.map((item) => {
            const I = item.Icon;
            const liked = engStats?.myLikes?.includes(item.resourceKey);
            const saved = engStats?.mySaves?.includes(item.resourceKey);
            const open = expandedKey === item.resourceKey;
            const cg = getConfig(item.resourceKey);
            const q = open ? quoteFor(item.resourceKey) : null;

            return (
              <article
                key={item.resourceKey}
                className={`rs-service-card rs-card-interactive${open ? " rs-service-card--open" : ""}`}
              >
                <span className="rs-cat-pill">
                  {t.serviceCategory}: {item.category}
                </span>
                <Link href={item.ctaHref} className="rs-card-title-link">
                  <div className="rs-card-title-row">
                    <I size={22} strokeWidth={1.45} className="rs-icon-gold" aria-hidden />
                    <h3>{item.title}</h3>
                  </div>
                  <p>{item.description}</p>
                </Link>
                <div className="rs-svc-pages-row">
                  <label className="rs-svc-pages-label" htmlFor={`rs-pages-${item.resourceKey}`}>
                    {t.svcQuotePages}
                  </label>
                  <select
                    id={`rs-pages-${item.resourceKey}`}
                    className="rs-svc-select rs-svc-select--inline"
                    value={cg.pageCount}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setConfigField(item.resourceKey, { pageCount: v });
                      persistStoredQuote(item.resourceKey, v);
                    }}
                  >
                    {pageOptions.map((o) => (
                      <option key={o.v} value={o.v}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="rs-engage-row" aria-label="Engagement">
                  <button
                    type="button"
                    className="rs-engage-pill"
                    data-active={liked ? "true" : "false"}
                    disabled={engBusy}
                    onClick={() => runEngagementAction({ type: "like", resourceKey: item.resourceKey })}
                  >
                    <Heart size={16} strokeWidth={1.5} className="rs-icon-gold" fill={liked ? "currentColor" : "none"} aria-hidden />
                    {t.engagementLike}
                  </button>
                  <button
                    type="button"
                    className="rs-engage-pill"
                    data-active={saved ? "true" : "false"}
                    disabled={engBusy}
                    onClick={() => runEngagementAction({ type: "save", resourceKey: item.resourceKey })}
                  >
                    <Bookmark size={16} strokeWidth={1.5} className="rs-icon-gold" fill={saved ? "currentColor" : "none"} aria-hidden />
                    {t.engagementSave}
                  </button>
                  <button
                    type="button"
                    className="rs-engage-pill"
                    data-active="false"
                    disabled={engBusy}
                    onClick={() => runEngagementAction({ type: "request", resourceKey: item.resourceKey })}
                  >
                    {t.engagementRequest}
                  </button>
                  <button
                    type="button"
                    className="rs-engage-pill rs-engage-pill--accent"
                    data-active={open ? "true" : "false"}
                    onClick={() => toggleExpand(item.resourceKey)}
                  >
                    <SlidersHorizontal size={15} aria-hidden />
                    {open ? t.svcQuoteHide : t.svcQuoteCustomize}
                  </button>
                </div>

                {open ? (
                  <div className="rs-svc-config">
                    <div className="rs-svc-config-grid">
                      <label className="rs-svc-field">
                        <span>{t.svcQuoteTier}</span>
                        <select
                          className="rs-svc-select"
                          value={cg.tier}
                          onChange={(e) => setConfigField(item.resourceKey, { tier: e.target.value })}
                        >
                          {tierOptions(t).map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="rs-svc-field">
                        <span>{t.svcQuotePages}</span>
                        <select
                          className="rs-svc-select"
                          value={String(cg.pageCount)}
                          onChange={(e) => setConfigField(item.resourceKey, { pageCount: Number(e.target.value) })}
                        >
                          {pageOptions.map((o) => (
                            <option key={o.v} value={o.v}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="rs-svc-field">
                        <span>{t.svcQuoteResumeType}</span>
                        <select
                          className="rs-svc-select"
                          value={cg.resumeType}
                          onChange={(e) => setConfigField(item.resourceKey, { resumeType: e.target.value })}
                        >
                          <option value="chronological">{t.svcResumeChronological}</option>
                          <option value="hybrid">{t.svcResumeHybrid}</option>
                          <option value="executive">{t.svcResumeExecutive}</option>
                        </select>
                      </label>
                      <label className="rs-svc-field">
                        <span>{t.svcQuoteLanguage}</span>
                        <select
                          className="rs-svc-select"
                          value={cg.languageMode}
                          onChange={(e) => setConfigField(item.resourceKey, { languageMode: e.target.value })}
                        >
                          <option value="en">{t.svcLangEn}</option>
                          <option value="fr">{t.svcLangFr}</option>
                          <option value="bilingual">{t.svcLangBilingual}</option>
                        </select>
                      </label>
                      <label className="rs-svc-field rs-svc-field--wide">
                        <span>{t.svcQuoteDelivery}</span>
                        <select
                          className="rs-svc-select"
                          value={cg.delivery}
                          onChange={(e) => setConfigField(item.resourceKey, { delivery: e.target.value })}
                        >
                          <option value="standard">{t.svcDeliveryStandard}</option>
                          <option value="expedited">{t.svcDeliveryExpedited}</option>
                          <option value="rush">{t.svcDeliveryRush}</option>
                        </select>
                      </label>
                      <div className="rs-svc-field rs-svc-field--wide rs-svc-addon-group">
                        <span className="rs-svc-addon-label">{t.svcQuoteAddons}</span>
                        <div className="rs-svc-addon-row">
                          {[
                            ["strategicLetter", t.svcAddonLetter],
                            ["linkedinSprint", t.svcAddonLinkedin],
                            ["interviewPack", t.svcAddonInterview],
                          ].map(([k, label]) => (
                            <label key={k} className="rs-svc-checkbox">
                              <input
                                type="checkbox"
                                checked={Boolean(cg.addons?.[k])}
                                onChange={(e) =>
                                  setConfigField(item.resourceKey, {
                                    addons: { ...cg.addons, [k]: e.target.checked },
                                  })
                                }
                              />
                              <span>{label}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="rs-svc-quote">
                      <p className="rs-svc-quote-title">{t.svcQuoteSummary}</p>
                      <ul className="rs-svc-quote-lines">
                        {q.lines.map((line, idx) => (
                          <li key={line.key}>
                            <span>{t[line.labelKey] || line.labelKey}</span>
                            <span>{idx === 0 ? `$${line.amount}` : `+$${line.amount}`}</span>
                          </li>
                        ))}
                      </ul>
                      <p className="rs-svc-quote-total">
                        <span>{t.svcQuoteEstimated}</span>
                        <span>${q.indicativeTotal}</span>
                      </p>
                      <p className="rs-svc-quote-note">{t.svcQuoteStripeNote}</p>
                      <div className="rs-svc-quote-actions">
                        <button type="button" className="rs-btn-accent rs-btn-accent--narrow" onClick={goPricingWithQuote}>
                          {t.svcQuoteContinue}
                          <ArrowRight size={14} aria-hidden />
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}

                <Link href={item.ctaHref} className="rs-card-cta">
                  {item.ctaLabel}
                  <ArrowRight size={14} aria-hidden />
                </Link>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
