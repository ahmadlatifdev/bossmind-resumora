import { useCallback, useEffect, useState } from "react";
import styles from "@/styles/bossmind-admin.module.css";

const LS_KEY = "bossmind_orchestration_bearer";

const DOMAIN_LABELS = {
  sharedMemory: "Shared Memory (Neon)",
  errorMemory: "Error Memory + Auto-Fix",
  antiLeak: "Anti-Leak Enforcement",
  autoRecovery: "Auto-Recovery Loops",
  deploymentVerification: "Deployment Verification",
  runtimeSync: "Runtime Synchronization",
  crossProjectMemory: "Cross-Project Intelligence",
  autonomousValidation: "Autonomous Validation",
  predictivePrevention: "Predictive Prevention",
  selfHealingChain: "Self-Healing Orchestrator",
  continuousMonitoring: "Continuous Monitoring",
};

function scoreClass(pct, target = 98) {
  if (pct >= target) return styles.scoreOk;
  if (pct >= 75) return styles.scoreWarn;
  return styles.scoreBad;
}

export default function BossMindAdminDashboard() {
  const [token, setToken] = useState("");
  const [health, setHealth] = useState(null);
  const [core, setCore] = useState(null);
  const [production, setProduction] = useState(null);
  const [hub, setHub] = useState(null);
  const [runtime, setRuntime] = useState(null);
  const [projectKey, setProjectKey] = useState("resumora");
  const [shortcutLog, setShortcutLog] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const t = window.localStorage.getItem(LS_KEY) || "";
    if (t) queueMicrotask(() => setToken(t));
  }, []);

  const headers = useCallback(() => {
    const h = { "Content-Type": "application/json" };
    if (token) h.Authorization = `Bearer ${token}`;
    return h;
  }, [token]);

  const load = useCallback(async () => {
    setError("");
    setBusy(true);
    try {
      const [hRes, cRes, mRes, rRes] = await Promise.all([
        fetch("/api/orchestration/bossmind-health", { headers: headers() }),
        fetch("/api/orchestration/bossmind-core-optimization", { headers: headers() }),
        fetch(`/api/orchestration/bossmind-shared-memory?projectKey=${encodeURIComponent(projectKey)}`, {
          headers: headers(),
        }),
        fetch("/api/orchestration/bossmind-runtime-authority", { headers: headers() }),
      ]);
      const hJson = await hRes.json();
      const cJson = await cRes.json();
      const mJson = await mRes.json();
      if (!hRes.ok) throw new Error(hJson.error || `health ${hRes.status}`);
      if (!cRes.ok) throw new Error(cJson.error || `core ${cRes.status}`);
      setHealth(hJson);
      setCore(cJson.latest || null);
      setProduction(hJson.productionAutonomous?.lastReport || null);
      const rJson = await rRes.json();
      setHub(mRes.ok ? mJson : hJson.sharedMemoryHub || null);
      setRuntime(rRes.ok ? rJson : hJson.runtimeAuthority || null);
    } catch (e) {
      setError(e.message || "Failed to load orchestration data");
    } finally {
      setBusy(false);
    }
  }, [headers, projectKey]);

  const runRuntimeCycle = async () => {
    setError("");
    setBusy(true);
    setShortcutLog("");
    try {
      const r = await fetch("/api/orchestration/bossmind-runtime-authority", {
        method: "POST",
        headers: {
          ...headers(),
          "X-Bossmind-Writer-Agent": "master_admin_shortcut",
        },
        body: JSON.stringify({
          projectKey,
          captureScreenshot: true,
          writerAgent: "master_admin_shortcut",
        }),
      });
      const j = await r.json();
      if (!r.ok && r.status !== 207) throw new Error(j.error || `runtime ${r.status}`);
      setShortcutLog(JSON.stringify(j, null, 2));
      await load();
    } catch (e) {
      setError(e.message || "Runtime authority cycle failed");
    } finally {
      setBusy(false);
    }
  };

  const runShortcut = async (shortcutId, dryRun = false) => {
    setError("");
    setBusy(true);
    setShortcutLog("");
    try {
      const r = await fetch("/api/orchestration/bossmind-shared-memory", {
        method: "POST",
        headers: {
          ...headers(),
          "X-Bossmind-Writer-Agent": "master_admin_shortcut",
        },
        body: JSON.stringify({
          action: "run_shortcut",
          projectKey,
          shortcutId,
          dryRun,
          writerAgent: "master_admin_shortcut",
        }),
      });
      const j = await r.json();
      if (!r.ok && r.status !== 207) throw new Error(j.error || `shortcut ${r.status}`);
      setShortcutLog(JSON.stringify(j, null, 2));
      await load();
    } catch (e) {
      setError(e.message || "Shortcut failed");
    } finally {
      setBusy(false);
    }
  };

  const runOptimization = async () => {
    setError("");
    setBusy(true);
    try {
      const r = await fetch("/api/orchestration/bossmind-core-optimization", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ skipLive: false }),
      });
      const j = await r.json();
      if (!r.ok && r.status !== 207) throw new Error(j.error || `run ${r.status}`);
      setCore(j);
    } catch (e) {
      setError(e.message || "Optimization run failed");
    } finally {
      setBusy(false);
    }
  };

  const saveToken = () => {
    if (typeof window !== "undefined") window.localStorage.setItem(LS_KEY, token);
    load();
  };

  useEffect(() => {
    if (!token) return;
    load();
  }, [token, load]);

  const target = core?.targetAutonomousReliabilityPercent ?? 98;
  const overall = core?.overallAutonomousReliabilityPercent ?? null;
  const domains = core?.domains || {};
  const projects = core?.domains?.crossProjectMemory?.projects || [];
  const blockDeploy = core?.blockDeploy ?? production?.blockDeploy;
  const memoryIntegrity = domains.sharedMemory?.memoryIntegrity;
  const validationLive = domains.autonomousValidation?.liveValidation;
  const monitor = domains.continuousMonitoring;

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <h1 className={styles.title}>BossMind Master Admin</h1>
        <p className={styles.sub}>
          Production orchestration center — proof-based scores only (no simulated %).
        </p>
        <div className={styles.authRow}>
          <input
            type="password"
            className={styles.authInput}
            placeholder="BOSSMIND_ORCHESTRATION_SECRET"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            aria-label="Orchestration bearer token"
          />
          <button type="button" className={styles.btn} onClick={saveToken}>
            Connect
          </button>
          <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={load} disabled={busy}>
            Refresh
          </button>
        </div>
      </header>

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}

      {overall != null ? (
        <div className={styles.grid}>
          <article className={`${styles.card} ${styles.overall}`}>
            <h3>Overall autonomous reliability</h3>
            <p className={`${styles.score} ${scoreClass(overall, target)}`}>{overall}%</p>
            <p className={styles.scoreTarget}>
              Target {target}% · {core.meetsTarget ? "Meets target" : "Below target"}
              {blockDeploy ? " · Deploy blocked" : ""}
            </p>
          </article>

          {memoryIntegrity ? (
            <article className={styles.card}>
              <h3>Memory integrity</h3>
              <p className={`${styles.score} ${scoreClass(memoryIntegrity.percent, 95)}`}>
                {memoryIntegrity.percent}%
              </p>
              <p className={styles.scoreTarget}>
                {memoryIntegrity.staleOverwriteRisk ? "Stale overwrite risk" : "Fingerprint aligned"}
              </p>
            </article>
          ) : null}

          {validationLive ? (
            <article className={styles.card}>
              <h3>Live validation</h3>
              <p className={`${styles.score} ${scoreClass(validationLive.percent, 92)}`}>
                {validationLive.percent}%
              </p>
            </article>
          ) : null}

          {monitor ? (
            <article className={styles.card}>
              <h3>Continuous monitor</h3>
              <p className={`${styles.score} ${scoreClass(monitor.percent, 92)}`}>{monitor.percent}%</p>
              <p className={styles.scoreTarget}>Cycle {monitor.cycle ?? "—"}</p>
            </article>
          ) : null}

          {Object.entries(DOMAIN_LABELS).map(([key, label]) => {
            const pct = domains[key]?.percent ?? 0;
            return (
              <article key={key} className={styles.card}>
                <h3>{label}</h3>
                <p className={`${styles.score} ${scoreClass(pct, target)}`}>{pct}%</p>
              </article>
            );
          })}

          {projects.length > 0 ? (
            <article className={styles.card}>
              <h3>Registered projects</h3>
              <ul className={styles.projectList}>
                {projects.map((p) => (
                  <li key={p.id}>
                    <span>{p.displayName}</span>
                    <span>{p.repoPresent ? p.gitHead || "local" : "not mounted"}</span>
                  </li>
                ))}
              </ul>
            </article>
          ) : null}

          {health?.ultraAntileak?.lastLock ? (
            <article className={styles.card}>
              <h3>Ultra anti-leak</h3>
              <p className={styles.score}>
                {health.ultraAntileak.lastLock.overallProductionSafetyPercent ?? "—"}%
              </p>
            </article>
          ) : null}

          {core?.repairActions?.length ? (
            <article className={`${styles.card} ${styles.wide}`}>
              <h3>Repair actions</h3>
              <ul className={styles.projectList}>
                {core.repairActions.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </article>
          ) : null}
        </div>
      ) : (
        <p className={styles.sub}>Connect with orchestration secret, then run optimization.</p>
      )}

      {runtime?.latestCycle ? (
        <article className={`${styles.card} ${styles.wide}`}>
          <h3>Runtime authority</h3>
          <p className={styles.scoreTarget}>
            Orchestration {runtime.latestCycle.orchestrationPercent}% ·{" "}
            {runtime.latestCycle.meetsTarget ? "Meets target" : "Below target"} · Mode{" "}
            {runtime.latestCycle.executionMode}
          </p>
        </article>
      ) : null}

      {hub?.shortcuts?.length ? (
        <section className={styles.shortcutSection}>
          <h2 className={styles.shortcutTitle}>Shared memory shortcuts</h2>
          <p className={styles.sub}>
            One Neon hub for all BossMind projects — read everywhere; write via orchestrator only.
          </p>
          <label className={styles.projectPick}>
            Project{" "}
            <select
              value={projectKey}
              onChange={(e) => setProjectKey(e.target.value)}
              className={styles.authInput}
              aria-label="Project key"
            >
              {(hub.projects || [{ id: "resumora" }]).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.displayName || p.id}
                </option>
              ))}
            </select>
          </label>
          <div className={styles.shortcutGrid}>
            {hub.shortcuts.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`${styles.btn} ${styles.btnGhost}`}
                disabled={busy || !token}
                onClick={() => runShortcut(s.id)}
              >
                {s.label}
              </button>
            ))}
          </div>
          {shortcutLog ? (
            <pre className={styles.shortcutLog} aria-live="polite">
              {shortcutLog}
            </pre>
          ) : null}
        </section>
      ) : null}

      <div className={styles.actions}>
        <button type="button" className={styles.btn} onClick={runRuntimeCycle} disabled={busy || !token}>
          Run runtime authority
        </button>
        <button type="button" className={styles.btn} onClick={runOptimization} disabled={busy || !token}>
          Run core optimization
        </button>
        <a href="/runtime-sync" className={`${styles.btn} ${styles.btnGhost}`}>
          Runtime sync
        </a>
        <a href="/bossmind-ai-video" className={`${styles.btn} ${styles.btnGhost}`}>
          VibeVoyage
        </a>
      </div>
    </div>
  );
}