import Head from "next/head";
import { useCallback, useEffect, useState } from "react";
import MinimalAppChrome from "@/components/marketing/MinimalAppChrome";

const LS_KEY = "bossmind_ai_video_bearer";

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
    platforms: "youtube,tiktok,instagram",
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const t = window.localStorage.getItem(LS_KEY) || "";
    if (t) setToken(t);
  }, []);

  const authHeader = useCallback(() => {
    const headers = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
  }, [token]);

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
    if (token) load();
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

  return (
    <MinimalAppChrome>
      <Head>
        <title>BossMind AI Video Generator · Queue</title>
      </Head>
      <main className="rs-app-shell rs-app-shell--minimal-main">
        <section className="rs-simple-card rs-simple-card--wide">
          <h1>BossMind AI Video Generator</h1>
          <p style={{ marginTop: "0.75rem", color: "var(--rs-text-secondary)", maxWidth: "52rem" }}>
            Operator console for the <strong>ai-video-generator</strong> project (isolated from Resumora). Uses Neon{" "}
            <code>video_*</code> tables. FFmpeg, Runway/Luma/Kling, TTS, and n8n run on Railway / n8n — not in this
            process.
          </p>

          <div style={{ marginTop: "1rem", display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "flex-end" }}>
            <label style={{ flex: "1 1 16rem", display: "flex", flexDirection: "column", gap: "0.35rem" }}>
              <span>Bearer token (BOSSMIND_ORCHESTRATION_SECRET or BOSSMIND_AI_VIDEO_ADMIN_SECRET)</span>
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                autoComplete="off"
                style={{ padding: "0.5rem" }}
              />
            </label>
            <button type="button" className="rs-btn" onClick={saveToken}>
              Save token
            </button>
            <button type="button" className="rs-btn rs-btn--primary" onClick={load} disabled={!token || busy}>
              Refresh
            </button>
          </div>

          {error ? (
            <p style={{ marginTop: "1rem", color: "#f87171" }} role="alert">
              {error}
            </p>
          ) : null}

          {dashboard?.ok ? (
            <div style={{ marginTop: "1.5rem" }}>
              <h2>Queue counts</h2>
              <ul>
                {(dashboard.queueCounts || []).map((row) => (
                  <li key={row.status}>
                    {row.status}: <strong>{row.c}</strong>
                  </li>
                ))}
              </ul>
              <h3 style={{ marginTop: "1rem" }}>Recent errors</h3>
              <pre style={{ fontSize: "0.8rem", overflow: "auto", maxHeight: "12rem" }}>
                {JSON.stringify(dashboard.recentErrors || [], null, 2)}
              </pre>
              <h3 style={{ marginTop: "1rem" }}>Recent publishes</h3>
              <pre style={{ fontSize: "0.8rem", overflow: "auto", maxHeight: "12rem" }}>
                {JSON.stringify(dashboard.recentPublishes || [], null, 2)}
              </pre>
            </div>
          ) : null}

          <div style={{ marginTop: "2rem", borderTop: "1px solid var(--rs-border-subtle)", paddingTop: "1rem" }}>
            <h2>New job</h2>
            <label style={{ display: "flex", flexDirection: "column", gap: "0.35rem", marginTop: "0.75rem" }}>
              Title
              <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: "0.35rem", marginTop: "0.75rem" }}>
              Script / idea
              <textarea
                rows={6}
                value={form.rawScript}
                onChange={(e) => setForm((f) => ({ ...f, rawScript: e.target.value }))}
              />
            </label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem", marginTop: "0.75rem" }}>
              <label>
                Language{" "}
                <input
                  value={form.language}
                  onChange={(e) => setForm((f) => ({ ...f, language: e.target.value }))}
                  style={{ width: "6rem" }}
                />
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                <input
                  type="checkbox"
                  checked={form.auto_publish}
                  onChange={(e) => setForm((f) => ({ ...f, auto_publish: e.target.checked }))}
                />
                Auto-publish (n8n must enforce gates)
              </label>
            </div>
            <label style={{ display: "flex", flexDirection: "column", gap: "0.35rem", marginTop: "0.75rem" }}>
              Platforms (comma-separated)
              <input value={form.platforms} onChange={(e) => setForm((f) => ({ ...f, platforms: e.target.value }))} />
            </label>
            <button
              type="button"
              className="rs-btn rs-btn--primary"
              style={{ marginTop: "1rem" }}
              onClick={createJob}
              disabled={!token || busy}
            >
              Enqueue
            </button>
          </div>

          {queue?.items?.length ? (
            <div style={{ marginTop: "2rem" }}>
              <h2>Queue</h2>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", padding: "0.35rem" }}>ID</th>
                    <th style={{ textAlign: "left", padding: "0.35rem" }}>Status</th>
                    <th style={{ textAlign: "left", padding: "0.35rem" }}>Title</th>
                    <th style={{ textAlign: "left", padding: "0.35rem" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {queue.items.map((row) => (
                    <tr key={row.id}>
                      <td style={{ padding: "0.35rem" }}>{row.id}</td>
                      <td style={{ padding: "0.35rem" }}>{row.status}</td>
                      <td style={{ padding: "0.35rem" }}>{row.title || "—"}</td>
                      <td style={{ padding: "0.35rem" }}>
                        <button
                          type="button"
                          className="rs-btn"
                          disabled={busy}
                          onClick={() =>
                            patchQueue(row.id, { status: "scenario_build", review_status: "approved" })
                          }
                        >
                          Approve → scenario
                        </button>{" "}
                        <button
                          type="button"
                          className="rs-btn"
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
        </section>
      </main>
    </MinimalAppChrome>
  );
}
