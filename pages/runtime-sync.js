import Head from "next/head";
import { useEffect, useState } from "react";
import MinimalAppChrome from "@/components/marketing/MinimalAppChrome";

export default function RuntimeSyncPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/orchestration/runtime-sync-status", { credentials: "same-origin" })
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.error || `HTTP ${r.status}`);
        return body;
      })
      .then((j) => {
        if (!cancelled) setData(j);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message || "Failed to load runtime sync status");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const local = data?.localStatus;
  const drift = local?.drift || {};
  const hasDrift = Boolean(local?.hasDrift);

  return (
    <MinimalAppChrome>
      <Head>
        <title>Runtime Sync Monitor · Resumora</title>
      </Head>
      <main className="rs-app-shell rs-app-shell--minimal-main">
        <section className="rs-simple-card rs-simple-card--wide">
          <h1>BossMind Runtime Synchronization</h1>
          <p style={{ marginTop: "0.75rem", color: "var(--rs-text-secondary)" }}>
            Autonomous drift detection and baseline authority status for localhost/runtime/memory alignment.
          </p>
          {error ? (
            <p style={{ marginTop: "1rem", color: "#ff8b8b" }} role="status">
              {error}
            </p>
          ) : null}
          <div style={{ marginTop: "1.25rem", display: "grid", gap: "0.6rem" }}>
            <div>
              <strong>Authority key:</strong> {data?.authorityKey || "luxury_ui_baseline"}
            </div>
            <div>
              <strong>Neon shared memory:</strong> {data ? (data.neonEnabled ? "connected" : "offline") : "…"}
            </div>
            <div>
              <strong>Latest cycle:</strong> {local?.ts || "No cycle yet"}
            </div>
            <div>
              <strong>Drift status:</strong> {local ? (hasDrift ? "DRIFT DETECTED" : "SYNCHRONIZED") : "…"}
            </div>
            <div>
              <strong>Baseline hash:</strong> {local?.fingerprint?.hash || data?.authority?.baseline_hash || "n/a"}
            </div>
          </div>
          <div style={{ marginTop: "1.25rem", display: "grid", gap: "0.4rem", color: "var(--rs-text-secondary)" }}>
            <div>authorityMissing: {String(Boolean(drift.authorityMissing))}</div>
            <div>baselineHashMismatch: {String(Boolean(drift.baselineHashMismatch))}</div>
            <div>missingProtectedFiles: {String(Boolean(drift.missingProtectedFiles))}</div>
            <div>runtimeMismatch: {String(Boolean(drift.runtimeMismatch))}</div>
          </div>
        </section>
      </main>
    </MinimalAppChrome>
  );
}

