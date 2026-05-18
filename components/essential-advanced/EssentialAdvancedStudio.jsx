import { useCallback, useEffect, useMemo, useState } from "react";
import { translations } from "@/lib/marketing/site-copy";

function pct(completed, total) {
  if (!total) return 0;
  return Math.round((completed / total) * 100);
}

export default function EssentialAdvancedStudio({ lang }) {
  const t = translations[lang];
  const [state, setState] = useState("loading");
  const [catalog, setCatalog] = useState(null);
  const [progressMap, setProgressMap] = useState({});
  const [activeTab, setActiveTab] = useState("videos");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setState("loading");
    setError("");
    try {
      const entRes = await fetch("/api/essential-advanced/entitlement", { credentials: "same-origin" });
      const ent = await entRes.json();
      if (!ent.entitled) {
        setState("locked");
        return;
      }
      if (!ent.signedIn) {
        setState("auth");
        return;
      }
      const catRes = await fetch(`/api/essential-advanced/catalog?lang=${lang}`, { credentials: "same-origin" });
      const data = await catRes.json();
      if (!catRes.ok) {
        setError(data.error || "load_failed");
        setState("error");
        return;
      }
      const map = {};
      for (const p of data.progress || []) {
        map[p.assetKey] = p.completed;
      }
      setProgressMap(map);
      setCatalog(data.catalog);
      setState("ready");
    } catch {
      setError("network");
      setState("error");
    }
  }, [lang]);

  useEffect(() => {
    load();
  }, [load]);

  const completedCount = useMemo(() => {
    if (!catalog?.assetKeys) return 0;
    return catalog.assetKeys.filter((k) => progressMap[k]).length;
  }, [catalog, progressMap]);

  const totalAssets = catalog?.assetKeys?.length || 0;
  const progressPercent = pct(completedCount, totalAssets);

  async function markComplete(assetKey) {
    const next = !progressMap[assetKey];
    setProgressMap((m) => ({ ...m, [assetKey]: next }));
    await fetch("/api/essential-advanced/progress", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assetKey, completed: next }),
    });
  }

  if (state === "loading") {
    return (
      <div className="rs-ea-studio rs-ea-studio--loading">
        <p>{t.eaStudioLoading}</p>
      </div>
    );
  }

  if (state === "locked") {
    return (
      <div className="rs-ea-studio rs-ea-studio--locked">
        <h1>{t.eaStudioLockedTitle}</h1>
        <p>{t.eaStudioLockedLead}</p>
        <a href="/pricing#pricing" className="rs-btn-accent">
          {t.eaStudioLockedCta}
        </a>
      </div>
    );
  }

  if (state === "auth") {
    return (
      <div className="rs-ea-studio rs-ea-studio--auth">
        <h1>{t.eaStudioAuthTitle}</h1>
        <p>{t.eaStudioAuthLead}</p>
        <a href="/register?plan=essential_advanced" className="rs-btn-accent">
          {t.eaStudioAuthCta}
        </a>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="rs-ea-studio rs-ea-studio--error">
        <p>{t.eaStudioError}</p>
        <button type="button" className="rs-btn-ghost" onClick={load}>
          {t.eaStudioRetry}
        </button>
      </div>
    );
  }

  const L = lang;

  return (
    <div className="rs-ea-studio" data-rs-ea-studio="1">
      <header className="rs-ea-studio-header">
        <h1>{t.eaStudioTitle}</h1>
        <p className="rs-ea-studio-lead">{t.eaStudioLead}</p>
        <div className="rs-ea-progress" aria-label={t.eaStudioProgressLabel}>
          <div className="rs-ea-progress-bar" style={{ width: `${progressPercent}%` }} />
          <span className="rs-ea-progress-label">
            {progressPercent}% · {completedCount}/{totalAssets}
          </span>
        </div>
      </header>

      <nav className="rs-ea-tabs" aria-label={t.eaStudioNavLabel}>
        {[
          ["videos", t.eaStudioTabVideos],
          ["simulations", t.eaStudioTabSimulations],
          ["qa", t.eaStudioTabQa],
          ["tips", t.eaStudioTabTips],
          ["executive", t.eaStudioTabExecutive],
          ["downloads", t.eaStudioTabDownloads],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`rs-ea-tab${activeTab === id ? " rs-ea-tab--active" : ""}`}
            onClick={() => setActiveTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      {activeTab === "videos" && (
        <section className="rs-ea-panel">
          <div className="rs-ea-video-grid">
            {catalog.videos.map((v) => (
              <article key={v.id} className="rs-ea-card">
                <div className="rs-ea-video-embed">
                  <iframe
                    title={v.title[L]}
                    src={`https://www.youtube-nocookie.com/embed/${v.youtubeId}`}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    loading="lazy"
                  />
                </div>
                <h3>{v.title[L]}</h3>
                <p>{v.summary[L]}</p>
                <label className="rs-ea-check">
                  <input
                    type="checkbox"
                    checked={Boolean(progressMap[v.id])}
                    onChange={() => markComplete(v.id)}
                  />
                  {t.eaStudioMarkComplete}
                </label>
              </article>
            ))}
          </div>
        </section>
      )}

      {activeTab === "simulations" && (
        <section className="rs-ea-panel">
          {catalog.simulations.map((sim) => (
            <article key={sim.id} className="rs-ea-card rs-ea-card--sim">
              <h3>{sim.title[L]}</h3>
              <p className="rs-ea-meta">{sim.level[L]}</p>
              <ol className="rs-ea-qa-list">
                {sim.questions.map((item, idx) => (
                  <li key={idx}>
                    <strong>{item.q[L]}</strong>
                    <p>{item.a[L]}</p>
                  </li>
                ))}
              </ol>
              <label className="rs-ea-check">
                <input
                  type="checkbox"
                  checked={Boolean(progressMap[sim.id])}
                  onChange={() => markComplete(sim.id)}
                />
                {t.eaStudioMarkComplete}
              </label>
            </article>
          ))}
        </section>
      )}

      {activeTab === "qa" && (
        <section className="rs-ea-panel">
          <p className="rs-ea-count">
            {catalog.counts.qa} {t.eaStudioQaCount}
          </p>
          <div className="rs-ea-qa-scroll">
            {catalog.qaBank.map((item) => (
              <details key={item.id} className="rs-ea-qa-item">
                <summary>{item.q[L]}</summary>
                <p>{item.a[L]}</p>
                <label className="rs-ea-check">
                  <input
                    type="checkbox"
                    checked={Boolean(progressMap[item.id])}
                    onChange={() => markComplete(item.id)}
                  />
                  {t.eaStudioMarkComplete}
                </label>
              </details>
            ))}
          </div>
        </section>
      )}

      {activeTab === "tips" && (
        <section className="rs-ea-panel">
          <ul className="rs-ea-tips">
            {catalog.tips.map((tip) => (
              <li key={tip.id}>
                <label className="rs-ea-check rs-ea-check--inline">
                  <input
                    type="checkbox"
                    checked={Boolean(progressMap[tip.id])}
                    onChange={() => markComplete(tip.id)}
                  />
                  {tip.text[L]}
                </label>
              </li>
            ))}
          </ul>
        </section>
      )}

      {activeTab === "executive" && (
        <section className="rs-ea-panel">
          <h2>{catalog.executive.title[L]}</h2>
          {catalog.executive.modules.map((mod) => (
            <article key={mod.id} className="rs-ea-card">
              <h3>{mod.title[L]}</h3>
              <p>{mod.body[L]}</p>
              <label className="rs-ea-check">
                <input
                  type="checkbox"
                  checked={Boolean(progressMap[mod.id])}
                  onChange={() => markComplete(mod.id)}
                />
                {t.eaStudioMarkComplete}
              </label>
            </article>
          ))}
        </section>
      )}

      {activeTab === "downloads" && (
        <section className="rs-ea-panel">
          <ul className="rs-ea-downloads">
            {catalog.downloads.map((d) => (
              <li key={d.id}>
                <a
                  href={`/api/essential-advanced/download?assetId=${encodeURIComponent(d.id)}&lang=${lang}`}
                  className="rs-btn-ghost rs-ea-download-btn"
                  download
                >
                  {d.title}
                </a>
                <label className="rs-ea-check rs-ea-check--inline">
                  <input
                    type="checkbox"
                    checked={Boolean(progressMap[d.id])}
                    onChange={() => markComplete(d.id)}
                  />
                  {t.eaStudioMarkComplete}
                </label>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
