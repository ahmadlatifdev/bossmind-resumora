import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import SiteChrome from "@/components/marketing/SiteChrome";
import { useLanguage } from "@/context/LanguageContext";
import { FREE_TEST_SERVICE_KEYS } from "@/lib/marketing/free-test-services";
import { servicesByLang, translations } from "@/lib/marketing/site-copy";

export default function FreeTestPage() {
  const { lang, setLang } = useLanguage();
  const t = translations[lang];
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [serviceKey, setServiceKey] = useState("svc_ats");
  const [pageCount, setPageCount] = useState(2);
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const [errorKey, setErrorKey] = useState(null);

  const serviceOptions = useMemo(() => {
    const items = servicesByLang[lang] || [];
    return FREE_TEST_SERVICE_KEYS.map((key) => {
      const row = items.find((i) => i.resourceKey === key);
      return { key, label: row?.title || key };
    });
  }, [lang]);

  useEffect(() => {
    const q = router.query?.service;
    if (typeof q === "string" && FREE_TEST_SERVICE_KEYS.includes(q)) {
      setServiceKey(q);
    }
  }, [router.query?.service]);

  const onSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    setErrorKey(null);
    try {
      const fd = new FormData();
      fd.append("email", email);
      fd.append("serviceKey", serviceKey);
      fd.append("lang", lang);
      fd.append("pageCount", String(pageCount));
      fd.append("notes", notes);
      fd.append("requestType", "free_test_request");
      if (file) fd.append("resumeFile", file);
      const res = await fetch("/api/free-test", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (res.status === 200 && data.ok) {
        setMessage(t.freeTestSuccess);
        setEmail("");
        setNotes("");
        setFile(null);
      } else if (res.status === 409) {
        setErrorKey("duplicate");
      } else if (res.status === 503 && data.error === "free_test_requires_neon") {
        setErrorKey("neon");
      } else {
        setErrorKey("generic");
      }
    } catch {
      setErrorKey("generic");
    } finally {
      setBusy(false);
    }
  };

  const errText =
    errorKey === "duplicate"
      ? t.freeTestDuplicate
      : errorKey === "neon"
        ? t.freeTestNeonError
        : errorKey
          ? t.freeTestErrorGeneric
          : null;

  return (
    <SiteChrome>
      <Head>
        <title>
          {t.freeTestMetaTitle} · Resumora
        </title>
        <meta name="description" content={t.freeTestLead} />
      </Head>
      <main className="rs-section">
        <div className="rs-container rs-free-test-wrap">
          <p className="rs-eyebrow">{t.navServices}</p>
          <h1 className="rs-page-title">{t.freeTestTitle}</h1>
          <p className="rs-subtitle">{t.freeTestLead}</p>

          <div className="rs-free-test-lang-row">
            <span className="rs-svc-pages-label">{t.freeTestLang}</span>
            <div className="rs-lang-toggle-mini">
              <button
                type="button"
                className={lang === "en" ? "is-active" : ""}
                onClick={() => setLang("en")}
              >
                {t.langEnglish}
              </button>
              <button
                type="button"
                className={lang === "fr" ? "is-active" : ""}
                onClick={() => setLang("fr")}
              >
                {t.langFrench}
              </button>
            </div>
          </div>

          {message ? (
            <aside className="rs-free-test-banner rs-free-test-banner--ok" role="status">
              {message}
            </aside>
          ) : null}
          {errText ? (
            <aside className="rs-free-test-banner rs-free-test-banner--err" role="alert">
              {errText}
            </aside>
          ) : null}

          <form className="rs-free-test-form" onSubmit={onSubmit}>
            <label className="rs-free-test-field">
              <span>{t.freeTestEmail}</span>
              <input
                className="rs-input"
                type="email"
                name="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label className="rs-free-test-field">
              <span>{t.freeTestService}</span>
              <select
                className="rs-svc-select"
                value={serviceKey}
                onChange={(e) => setServiceKey(e.target.value)}
              >
                {serviceOptions.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="rs-free-test-field">
              <span>{t.freeTestPages}</span>
              <select className="rs-svc-select" value={pageCount} onChange={(e) => setPageCount(Number(e.target.value))}>
                {[1, 2, 3, 4].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <label className="rs-free-test-field rs-free-test-field--wide">
              <span>
                {t.freeTestNotes} ({t.freeTestOptional})
              </span>
              <textarea
                className="rs-input"
                rows={4}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </label>
            <label className="rs-free-test-field rs-free-test-field--wide">
              <span>
                {t.freeTestUpload} ({t.freeTestOptional})
              </span>
              <input type="file" accept=".pdf,.doc,.docx,application/pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            </label>
            <p className="rs-free-test-muted">{t.freeTestLimit}</p>
            <p className="rs-free-test-muted">{t.freeTestDisclaimer}</p>
            <button type="submit" className="rs-btn-accent" disabled={busy}>
              {busy ? "…" : t.freeTestSubmit}
            </button>
            <p className="rs-free-test-muted">
              <Link href="/pricing">{t.svcQuoteContinue}</Link>
            </p>
          </form>
        </div>
      </main>
    </SiteChrome>
  );
}
