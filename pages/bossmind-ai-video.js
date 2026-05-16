import Head from "next/head";
import { useCallback, useEffect, useState } from "react";
import MinimalAppChrome from "@/components/marketing/MinimalAppChrome";
import vv from "@/styles/vibevoyage-master-dashboard.module.css";

const LS_KEY = "bossmind_ai_video_bearer";

const ORGANIC_PLATFORMS_DEFAULT =
  "youtube,youtube_shorts,tiktok,instagram_reels,facebook_reels,pinterest,linkedin,x,threads,vimeo,dailymotion";

const FALLBACK_LANGS = [
  { code: "en", label: "English" },
  { code: "ar", label: "Arabic" },
  { code: "fr", label: "French" },
  { code: "es", label: "Spanish" },
  { code: "de", label: "German" },
  { code: "ru", label: "Russian" },
  { code: "sq", label: "Albanian" },
];

export default function BossMindAiVideoDashboardPage() {
  const [token, setToken] = useState("");
  const [dashboard, setDashboard] = useState(null);
  const [queue, setQueue] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    title: "",
    rawScript: "",
    language: "en",
    auto_publish: false,
    platforms: ORGANIC_PLATFORMS_DEFAULT,
  });
  const [jobDetail, setJobDetail] = useState(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const t = window.localStorage.getItem(LS_KEY) || "";
    if (!t) return;
    queueMicrotask(() => setToken(t));
  }, []);

  const authHeader = useCallback(() => {
    const headers = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
  }, [token]);

  const loadJob = useCallback(
    async (id) => {
      setError("");
      try {
        const r = await fetch(`/api/orchestration/ai-video/job/${id}`, { headers: authHeader() });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || `job ${r.status}`);
        setJobDetail(j);
      } catch (e) {
        setError(e.message || "job load failed");
      }
    },
    [authHeader]
  );

  const saveToken = () => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(LS_KEY, token);
  };

  const load = useCallback(async () => {
    setError("");
    try {
      const [d, q] = await Promise.all([
        fetch("/api/orchestration/ai-video/dashboard", { headers: authHeader() }).then(async (r) => {
          const j = await r.json();
          if (!r.ok) throw new Error(j.error || `dashboard ${r.status}`);
          return j;
        }),
        fetch("/api/orchestration/ai-video/queue?limit=40", { headers: authHeader() }).then(async (r) => {
          const j = await r.json();
          if (!r.ok) throw new Error(j.error || `queue ${r.status}`);
          return j;
        }),
      ]);
      setDashboard(d);
      setQueue(q);
    } catch (e) {
      setError(e.message || "load failed");
    }
  }, [authHeader]);

  useEffect(() => {
    if (!token) return;
    queueMicrotask(() => {
      void load();
    });
  }, [token, load]);

  const patchQueue = async (id, body) => {
    setBusy(true);
    setError("");
    try {
      const r = await fetch(`/api/orchestration/ai-video/queue/${id}`, {
        method: "PATCH",
        headers: authHeader(),
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || r.status);
      await load();
      return j;
    } catch (e) {
      setError(e.message || "patch failed");
    } finally {
      setBusy(false);
    }
  };

  const createJob = async () => {
    setBusy(true);
    setError("");
    try {
      const target_platforms = form.platforms
        .split(/[\s,]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      const r = await fetch("/api/orchestration/ai-video/queue", {
        method: "POST",
        headers: authHeader(),
        body: JSON.stringify({
          title: form.title || "Untitled",
          rawScript: form.rawScript,
          language: form.language,
          auto_publish: form.auto_publish,
          target_platforms,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || String(r.status));
      setForm((f) => ({ ...f, title: "", rawScript: "" }));
      await load();
      return j;
    } catch (e) {
      setError(e.message || "create failed");
    } finally {
      setBusy(false);
    }
  };

  const brand = dashboard?.brand;
  const tagline = brand?.tagline || "Cinematic Adventures Around the World";
  const mission = brand?.mission || "";
  const langs = brand?.languages?.length ? brand.languages : FALLBACK_LANGS;

  return (
    <MinimalAppChrome>
      <Head>
        <title>VibeVoyage · Master Dashboard</title>
        <meta name="description" content={tagline} />
      </Head>
      <main className="rs-app-shell rs-app-shell--minimal-main">
        <section className={`rs-simple-card rs-simple-card--wide ${vv.vvShell}`}>
          <header className={vv.vvHero}>
            <p className={vv.vvEyebrow}>BossMind · isolated project ai-video-generator</p>
            <h1 className={vv.vvTitle}>VibeVoyage</h1>
            <p className={vv.vvTagline}>{tagline}</p>
            {mission ? <p className={vv.vvMission}>{mission}</p> : null}
            <p className={vv.vvMission}>
              Queue, script review, scenario pipeline, renders, and publish logs live in Neon. FFmpeg, provider APIs,
              organic staggered posting, OAuth refresh, GSC/video sitemap, and trend jobs run on Railway and n8n — not
              inside this Next.js process. Organic only: no paid ads, no fake engagement.
            </p>
          </header>

          <div className={vv.vvGrid}>
            <div className={vv.vvCard}>
              <h3>Master monitors</h3>
              <p>
                BossMind health (Stripe, Neon, self-heal, VibeVoyage neon summary):{" "}
                <code style={{ color: "#d4c4a8" }}>GET /api/orchestration/bossmind-health</code> with the same Bearer
                as orchestration diagnostics.
              </p>
              <p className={vv.vvHint}>Trend/SEO automation is enforced in n8n + worker webhooks using the brand bundle in each publish manifest.</p>
            </div>
            <div className={vv.vvCard}>
              <h3>Multilingual</h3>
              <p>Primary VO/captions language per job; n8n expands titles, descriptions, hashtags, and CTAs across locales.</p>
              <ul>
                {(brand?.languages || FALLBACK_LANGS).map((l) => (
                  <li key={l.code}>
                    {l.label} ({l.code})
                  </li>
                ))}
              </ul>
            </div>
            <div className={vv.vvCard}>
              <h3>Organic distribution</h3>
              <p>Default platform list targets long-form, Shorts-style surfaces, and professional networks. Stagger posts in n8n to stay algorithm-safe.</p>
            </div>
          </div>

          <div className={vv.vvAuthRow}>
            <label className={vv.vvLabel}>
              <span>Bearer (BOSSMIND_ORCHESTRATION_SECRET or BOSSMIND_AI_VIDEO_ADMIN_SECRET)</span>
              <input
                type="password"
                className={vv.vvInput}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                autoComplete="off"
              />
            </label>
            <button type="button" className={vv.vvBtn} onClick={saveToken}>
              Save token
            </button>
            <button type="button" className={vv.vvBtnPrimary} onClick={load} disabled={!token || busy}>
              Refresh
            </button>
          </div>

          {error ? (
            <p className={vv.vvError} role="alert">
              {error}
            </p>
          ) : null}

          {dashboard?.ok ? (
            <div style={{ marginTop: "1.5rem" }}>
              <h2 className={vv.vvSectionTitle}>Operations</h2>
              <div className={vv.vvGrid}>
                <div className={vv.vvCard}>
                  <h3>Queue counts</h3>
                  <ul className={vv.vvCounts}>
                    {(dashboard.queueCounts || []).map((row) => (
                      <li key={row.status}>
                        <span>{row.status}</span>
                        <strong>{row.c}</strong>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className={vv.vvCard}>
                  <h3>API usage (30d)</h3>
                  <pre className={vv.vvPre}>{JSON.stringify(dashboard.apiUsage30dByProvider || [], null, 2)}</pre>
                </div>
                <div className={vv.vvCard}>
                  <h3>Recent errors</h3>
                  <pre className={vv.vvPre}>{JSON.stringify(dashboard.recentErrors || [], null, 2)}</pre>
                </div>
                <div className={vv.vvCard}>
                  <h3>Recent publishes</h3>
                  <pre className={vv.vvPre}>{JSON.stringify(dashboard.recentPublishes || [], null, 2)}</pre>
                </div>
              </div>
            </div>
          ) : null}

          <div className={vv.vvDivider}>
            <h2 className={vv.vvSectionTitle}>New cinematic job</h2>
            <label className={vv.vvLabel} style={{ marginTop: "0.75rem" }}>
              Title
              <input className={vv.vvInput} value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
            </label>
            <label className={vv.vvLabel} style={{ marginTop: "0.75rem" }}>
              Script / creative brief
              <textarea
                className={vv.vvTextarea}
                rows={6}
                value={form.rawScript}
                onChange={(e) => setForm((f) => ({ ...f, rawScript: e.target.value }))}
              />
            </label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem", marginTop: "0.75rem", alignItems: "center" }}>
              <label className={vv.vvLabel} style={{ flex: "0 1 12rem" }}>
                Primary language
                <select className={vv.vvSelect} value={form.language} onChange={(e) => setForm((f) => ({ ...f, language: e.target.value }))}>
                  {langs.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", color: "rgba(220,215,205,0.9)", fontSize: "0.85rem" }}>
                <input
                  type="checkbox"
                  checked={form.auto_publish}
                  onChange={(e) => setForm((f) => ({ ...f, auto_publish: e.target.checked }))}
                />
                Auto-publish (n8n gates + stagger)
              </label>
            </div>
            <label className={vv.vvLabel} style={{ marginTop: "0.75rem" }}>
              Target platforms (comma-separated)
              <input className={vv.vvInput} value={form.platforms} onChange={(e) => setForm((f) => ({ ...f, platforms: e.target.value }))} />
            </label>
            <div className={vv.vvStackRow}>
              <button type="button" className={vv.vvBtn} onClick={() => setForm((f) => ({ ...f, platforms: ORGANIC_PLATFORMS_DEFAULT }))}>
                Apply full organic stack
              </button>
            </div>
            <button type="button" className={vv.vvBtnPrimary} style={{ marginTop: "1rem" }} onClick={createJob} disabled={!token || busy}>
              Enqueue
            </button>
            <p className={vv.vvHint}>
              Worker: <code>npm run bossmind:ai-video:orchestrator</code> on Railway. Approve scripts below to enter scenario generation.
            </p>
          </div>

          {queue?.items?.length ? (
            <div style={{ marginTop: "2rem" }}>
              <h2 className={vv.vvSectionTitle}>Queue manager</h2>
              <table className={vv.vvTable}>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Status</th>
                    <th>Title</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {queue.items.map((row) => (
                    <tr key={row.id}>
                      <td>{row.id}</td>
                      <td>{row.status}</td>
                      <td>
                        {row.title || "—"}
                        {row.payload?.error ? (
                          <span style={{ display: "block", color: "#f87171", fontSize: "0.75rem" }}>
                            {String(row.payload.error).slice(0, 120)}
                          </span>
                        ) : null}
                      </td>
                      <td>
                        <button type="button" className={vv.vvBtn} disabled={busy} onClick={() => loadJob(row.id)}>
                          Scenario / pipeline
                        </button>{" "}
                        <button
                          type="button"
                          className={vv.vvBtn}
                          disabled={busy}
                          onClick={() => patchQueue(row.id, { status: "scenario_build", review_status: "approved" })}
                        >
                          Approve → scenario
                        </button>{" "}
                        <button
                          type="button"
                          className={vv.vvBtn}
                          disabled={busy}
                          onClick={() => patchQueue(row.id, { status: "rejected", review_status: "rejected" })}
                        >
                          Reject
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {jobDetail?.ok ? (
            <div style={{ marginTop: "2rem" }}>
              <h2 className={vv.vvSectionTitle}>
                Pipeline detail · job {jobDetail.queue?.id}{" "}
                <button type="button" className={vv.vvBtn} onClick={() => setJobDetail(null)}>
                  Close
                </button>
              </h2>
              <p className={vv.vvHint}>Scenes, assets, renders, publish logs (JSON). Thumbnails, Shorts cuts, and multilingual variants are produced in worker/n8n after master render.</p>
              <pre className={vv.vvPre} style={{ maxHeight: "24rem" }}>
                {JSON.stringify(
                  {
                    queue: jobDetail.queue,
                    script: jobDetail.script,
                    scenario: jobDetail.scenario,
                    scenes: jobDetail.scenes,
                    assets: jobDetail.assets,
                    renders: jobDetail.renders,
                    publishes: jobDetail.publishes,
                  },
                  null,
                  2
                )}
              </pre>
            </div>
          ) : null}
        </section>
      </main>
    </MinimalAppChrome>
  );
}
