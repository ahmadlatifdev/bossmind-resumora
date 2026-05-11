import Head from "next/head";
import { useEffect, useState } from "react";
import MinimalAppChrome from "@/components/marketing/MinimalAppChrome";

function scoreRow(label, value, suffix = "") {
  const n = typeof value === "number" ? value : null;
  const display = n != null ? `${n}${suffix}` : value ?? "—";
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
      <span>{label}</span>
      <strong>{display}</strong>
    </div>
  );
}

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
  const autonomous = data?.autonomousRuntime;
  const continuePoint = data?.continuePoint;
  const drift = local?.drift || {};
  const hasDrift = Boolean(local?.hasDrift);
  const s = data?.scores || {};
  const structural = data?.structural;
  const rec = data?.reconciliation || local?.reconciliation;

  return (
    <MinimalAppChrome>
      <Head>
        <title>Runtime Sync Monitor · Resumora</title>
      </Head>
      <main className="rs-app-shell rs-app-shell--minimal-main">
        <section className="rs-simple-card rs-simple-card--wide">
          <h1>BossMind Runtime Synchronization</h1>
          <p style={{ marginTop: "0.75rem", color: "var(--rs-text-secondary)" }}>
            Autonomous drift detection, protected luxury baseline authority, and Neon-aligned deployment governance.
          </p>
          {error ? (
            <p style={{ marginTop: "1rem", color: "#ff8b8b" }} role="status">
              {error} — set <code>BOSSMIND_DIAGNOSTICS=1</code> or use orchestration secret for API access.
            </p>
          ) : null}

          <div style={{ marginTop: "1.35rem", display: "grid", gap: "0.55rem" }}>
            <h2 className="rs-h2" style={{ fontSize: "1.15rem", margin: 0 }}>
              Autonomy &amp; integrity scores
            </h2>
            {scoreRow("Composite autonomy", s.compositeAutonomyScore, "%")}
            {scoreRow("Enterprise orchestration", s.enterpriseOrchestrationScore, "%")}
            {scoreRow("Production reconciliation", s.productionReconciliationScore, "%")}
            {scoreRow("Runtime synchronization", s.runtimeSynchronizationScore, "%")}
            {scoreRow("Drift protection", s.driftProtectionScore, "%")}
            {scoreRow("Deployment / build integrity", s.deploymentIntegrityScore, "%")}
            {scoreRow("Protected baseline lock", s.protectedBaselineLockScore, "%")}
            {scoreRow("Memory authority (Neon)", s.memoryAuthorityScore, "%")}
            {scoreRow("Route authority", s.routeAuthorityScore, "%")}
          </div>

          <div style={{ marginTop: "1.35rem", display: "grid", gap: "0.55rem" }}>
            <h2 className="rs-h2" style={{ fontSize: "1.15rem", margin: 0 }}>
              Reconciliation engine
            </h2>
            <div>
              <strong>State:</strong>{" "}
              {rec ? (rec.ok ? "ALIGNED (no blocking mismatches)" : "MISMATCH") : "— (run sync or bossmind:reconcile)"}
            </div>
            {scoreRow("Reconcile score", rec?.score, "%")}
            {scoreRow("Authority alignment blend", rec?.alignmentBlend, "%")}
            <div>
              <strong>Git HEAD:</strong> {rec?.signals?.gitHead ? `${String(rec.signals.gitHead).slice(0, 7)}…` : "—"}
            </div>
            <div>
              <strong>Checkpoint commit:</strong>{" "}
              {rec?.signals?.checkpointCommit ? `${String(rec.signals.checkpointCommit).slice(0, 7)}…` : "—"}
            </div>
            <div>
              <strong>Neon baseline (memory):</strong>{" "}
              {rec?.signals?.neonAuthorityHash ? `${String(rec.signals.neonAuthorityHash).slice(0, 12)}…` : "—"}
            </div>
            <div>
              <strong>Workspace fingerprint:</strong>{" "}
              {rec?.signals?.fingerprintHash ? `${String(rec.signals.fingerprintHash).slice(0, 12)}…` : "—"}
            </div>
            <div>
              <strong>Runtime unreachable (last probe):</strong> {String(Boolean(rec?.signals?.probeUnreachable))}
            </div>
            {rec?.mismatches?.length ? (
              <ul style={{ margin: "0.25rem 0 0 1rem", color: "var(--rs-text-secondary)" }}>
                {rec.mismatches.map((m) => (
                  <li key={m.code}>
                    <code>{m.code}</code> ({m.severity}) — {m.detail}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <div style={{ marginTop: "1.35rem", display: "grid", gap: "0.6rem" }}>
            <div>
              <strong>Authority key:</strong> {data?.authorityKey || "luxury_ui_baseline"}
            </div>
            <div>
              <strong>Neon shared memory:</strong> {data ? (data.neonEnabled ? "connected" : "offline") : "…"}
            </div>
            <div>
              <strong>Continue-from-last checkpoint:</strong>{" "}
              {continuePoint
                ? `${data?.continuePointSource || "unknown"} @ ${continuePoint.commit_hash || continuePoint.commitHash || "n/a"}`
                : "none"}
            </div>
            <div>
              <strong>Autonomous controller loop:</strong>{" "}
              {autonomous ? (autonomous.degraded ? "ACTIVE (degraded)" : "ACTIVE (healthy)") : "not running / no status file"}
            </div>
            <div>
              <strong>Synchronization rate:</strong>{" "}
              {autonomous?.rates?.synchronizationRate != null ? `${autonomous.rates.synchronizationRate}%` : "—"}
            </div>
            <div>
              <strong>Healing rate:</strong>{" "}
              {autonomous?.rates?.healingRate != null ? `${autonomous.rates.healingRate}%` : "—"}
            </div>
            <div>
              <strong>Structural lock (single HomePage):</strong>{" "}
              {structural ? (structural.ok ? "OK" : "VIOLATION") : "…"}
            </div>
            <div>
              <strong>Rollback-ready (baseline hash in memory):</strong>{" "}
              {data?.rollbacksReady != null ? String(data.rollbacksReady) : "…"}
            </div>
            <div>
              <strong>Latest sync cycle:</strong> {local?.ts || "No local cycle yet (run bossmind:runtime:sync:once)"}
            </div>
            <div>
              <strong>Drift status:</strong> {local ? (hasDrift ? "DRIFT DETECTED" : "SYNCHRONIZED") : "…"}
            </div>
            <div>
              <strong>Baseline hash (fingerprint):</strong> {local?.fingerprint?.hash || data?.authority?.baseline_hash || "n/a"}
            </div>
          </div>
          <div style={{ marginTop: "1.25rem", display: "grid", gap: "0.4rem", color: "var(--rs-text-secondary)" }}>
            <div>authorityMissing: {String(Boolean(drift.authorityMissing))}</div>
            <div>baselineHashMismatch: {String(Boolean(drift.baselineHashMismatch))}</div>
            <div>missingProtectedFiles: {String(Boolean(drift.missingProtectedFiles))}</div>
            <div>runtimeMismatch: {String(Boolean(drift.runtimeMismatch))}</div>
            <div>structuralViolation: {String(Boolean(drift.structuralViolation))}</div>
            <div>pricingOnlyHome: {String(Boolean(drift.pricingOnlyHome))}</div>
          </div>
        </section>
      </main>
    </MinimalAppChrome>
  );
}
