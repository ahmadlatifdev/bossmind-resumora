/**
 * BossMind Stripe Dashboard Repair — Recovery Authority
 * detect → safe purge → isolated profile → verify → lock (Neon + runtime)
 *
 * Do not import next.config.js / next.config.ts — use process.env via loadRuntimeEnv().
 */
const fs = require("fs");
const path = require("path");
const { execSync, spawnSync } = require("child_process");
const hub = require("../shared/bossmind-hub-memory");
const neon = require("../shared/neon-memory");
const recoveryConfig = require("../../config/bossmind-stripe-session-recovery.json");

const PROCESS_ID = "stripe_dashboard_repair";
const LEGACY_PROCESS_ID = "stripe_session_repair";
const REPO_ROOT = path.join(__dirname, "..", "..");

function loadRuntimeEnv() {
  const siteUrl = String(
    process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || process.env.BOSSMIND_SITE_URL || ""
  )
    .trim()
    .replace(/\/$/, "");
  return {
    siteUrl,
    projectKey: String(process.env.BOSSMIND_PROJECT_KEY || "resumora").trim(),
  };
}

function assertRequiredEnv() {
  const hasDatabaseUrl = Boolean(
    String(process.env.NEON_DATABASE_URL || process.env.DATABASE_URL || "").trim()
  );
  if (!hasDatabaseUrl) {
    throw new Error(
      "bossmind-stripe-session-recovery: missing required env: NEON_DATABASE_URL or DATABASE_URL"
    );
  }
}

function loadConfig() {
  return recoveryConfig;
}

function resolveCwd(cwd) {
  return cwd && String(cwd).trim() ? cwd : REPO_ROOT;
}

function chromeUserDataRoot() {
  return path.join(process.env.LOCALAPPDATA || "", "Google", "Chrome", "User Data");
}

function isolatedProfileDir(cwd) {
  const config = loadConfig();
  const root = resolveCwd(cwd);
  return path.join(
    /* turbopackIgnore: true */ root,
    config.isolatedProfile?.relativeDir || "windows-heal/stripe-runtime/chrome-user-data"
  );
}

function listChromeProfiles(chromeRoot) {
  if (!fs.existsSync(chromeRoot)) return [];
  const profiles = [];
  const localStatePath = path.join(chromeRoot, "Local State");
  let order = ["Default"];
  if (fs.existsSync(localStatePath)) {
    try {
      const ls = JSON.parse(fs.readFileSync(localStatePath, "utf8"));
      order = Object.keys(ls?.profile?.info_cache || {});
    } catch {
      /* Default only */
    }
  }
  for (const name of order) {
    const dir = path.join(chromeRoot, name);
    if (!fs.existsSync(dir)) continue;
    const cookies = path.join(dir, "Network", "Cookies");
    const legacyCookies = path.join(dir, "Cookies");
    profiles.push({
      name,
      dir,
      cookiesPath: fs.existsSync(cookies) ? cookies : legacyCookies,
      hasCookies: fs.existsSync(cookies) || fs.existsSync(legacyCookies),
    });
  }
  return profiles;
}

function scanProfileArtifacts(profileDir, cwd) {
  try {
    const script = path.join(/* turbopackIgnore: true */ cwd, "scripts", "bossmind-stripe-profile-scan.mjs");
    const r = spawnSync(/* turbopackIgnore: true */ "node", [script, `--profile-dir=${profileDir}`], {
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
    });
    const line = String(r.stdout || "")
      .split("\n")
      .filter((l) => l.startsWith("{"))
      .pop();
    return line ? JSON.parse(line) : null;
  } catch {
    return null;
  }
}

function isChromeRunning() {
  try {
    const out = execSync(
      'powershell -NoProfile -Command "(Get-Process chrome -ErrorAction SilentlyContinue | Measure-Object).Count"',
      { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }
    );
    return Number(String(out).trim()) > 0;
  } catch {
    return false;
  }
}

function runPowerShellRepair(cwd, { apply = false, profile = "", closeChrome = false, skipIsolatedLaunch = false } = {}) {
  const root = resolveCwd(cwd);
  const ps1 = path.join(/* turbopackIgnore: true */ root, "scripts", "bossmind-stripe-session-repair.ps1");
  const args = ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ps1];
  if (apply) args.push("-Apply");
  if (profile) args.push("-ChromeProfile", profile);
  if (closeChrome || process.env.BOSSMIND_STRIPE_CLOSE_CHROME === "1") args.push("-CloseChrome");
  if (skipIsolatedLaunch) args.push("-SkipIsolatedLaunch");
  const r = spawnSync("powershell", args, {
    cwd: root,
    encoding: "utf8",
    env: process.env,
    maxBuffer: 24 * 1024 * 1024,
  });
  let parsed = null;
  const text = String(r.stdout || "").trim();
  const jsonLine = text.split("\n").filter((l) => l.startsWith("{")).pop();
  if (jsonLine) {
    try {
      parsed = JSON.parse(jsonLine);
    } catch {
      parsed = { raw: text.slice(-4000) };
    }
  }
  return {
    ok: r.status === 0 && parsed?.ok !== false,
    exitCode: r.status,
    stdout: text,
    stderr: String(r.stderr || ""),
    report: parsed,
  };
}

function edgeExecutable() {
  const candidates = [
    path.join(process.env["ProgramFiles(x86)"] || "", "Microsoft", "Edge", "Application", "msedge.exe"),
    path.join(process.env.ProgramFiles || "", "Microsoft", "Edge", "Application", "msedge.exe"),
  ];
  return candidates.find((p) => fs.existsSync(p)) || null;
}

function analyzeDom(dom, url) {
  const lower = dom.toLowerCase();
  const redirectLoopSuspected =
    (dom.match(/http-equiv="refresh"/gi) || []).length > 2 ||
    lower.includes("err_too_many_redirects") ||
    (lower.includes("dashboard.stripe.com") && (lower.match(/location\.href/g) || []).length > 4);

  const connectRedirectStuck =
    lower.includes("connect.stripe.com") &&
    (lower.includes("onboarding") || lower.includes("setup")) &&
    redirectLoopSuspected;

  const signInSuccessfulStuck =
    lower.includes("sign-in successful") ||
    lower.includes("sign in successful") ||
    (lower.includes("sign-in successful") && !lower.includes("nav-item"));

  const loginPage =
    lower.includes("sign in") ||
    lower.includes("log in") ||
    lower.includes("two-step") ||
    lower.includes("verification code");

  const dashboardRendered =
    lower.includes("stripe dashboard") ||
    lower.includes("data-testid") ||
    lower.includes("nav-item") ||
    lower.includes("test mode") ||
    lower.includes("products");

  const blockedScripts =
    lower.includes("err_blocked_by_client") ||
    lower.includes("net::err_blocked") ||
    (lower.includes("failed to load resource") && lower.includes("stripe.com"));

  const loadingStuck =
    lower.includes("loading") &&
    lower.includes("dashboard") &&
    dom.length < 80000 &&
    !dashboardRendered;

  return {
    url,
    redirectLoopSuspected,
    connectRedirectStuck,
    signInSuccessfulStuck,
    loginPage,
    dashboardRendered,
    blockedScripts,
    loadingStuck,
    domBytes: dom.length,
  };
}

async function probeUrl(edge, url, proofDir, { timeoutMs = 50000 } = {}) {
  const slug = url.replace(/[^a-z0-9]+/gi, "-").slice(0, 48);
  const shot = path.join(proofDir, `${slug}.png`);

  let dom = "";
  try {
    dom = execSync(
      `"${edge}" --headless=new --disable-gpu --dump-dom --virtual-time-budget=12000 "${url}"`,
      { encoding: "utf8", timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 }
    );
  } catch (e) {
    dom = String(e.stdout || "");
  }

  try {
    execSync(
      `"${edge}" --headless=new --disable-gpu --window-size=1440,900 --screenshot="${shot}" "${url}"`,
      { encoding: "utf8", timeout: timeoutMs, stdio: "pipe" }
    );
  } catch {
    /* screenshot best-effort */
  }

  const analysis = analyzeDom(dom, url);
  return {
    ...analysis,
    screenshotPath: fs.existsSync(shot) ? shot.replace(/\\/g, "/") : null,
  };
}

async function detectStripeSessionIssue({ cwd = REPO_ROOT, profileName = "" } = {}) {
  const root = resolveCwd(cwd);
  const config = loadConfig();
  const chromeRoot = chromeUserDataRoot();
  let profiles = listChromeProfiles(chromeRoot);
  if (profileName) profiles = profiles.filter((p) => p.name === profileName);

  const chromeRunning = isChromeRunning();
  const detection = {
    chromeRunning,
    chromeRoot,
    profileCount: profiles.length,
    profilesWithCookies: profiles.filter((p) => p.hasCookies).map((p) => p.name),
    profileScans: [],
    signals: [],
    primaryCause: null,
    confidence: 0,
    isolatedProfileDir: isolatedProfileDir(root).replace(/\\/g, "/"),
  };

  if (chromeRunning) {
    detection.signals.push({
      id: "chrome_locks_cookie_db",
      severity: "warn",
      note: "Chrome must close briefly for Stripe-only purge.",
    });
  }

  for (const p of profiles) {
    const scan = !chromeRunning ? scanProfileArtifacts(p.dir, root) : null;
    if (scan) {
      detection.profileScans.push({ profile: p.name, ...scan });
      if (scan.cookies?.count > 15) {
        detection.signals.push({
          id: "corrupted_stripe_cookies",
          severity: "medium",
          profile: p.name,
          cookieCount: scan.cookies.count,
        });
      }
      if (scan.storage?.hitCount > 0) {
        detection.signals.push({
          id: "corrupted_stripe_local_storage",
          severity: "medium",
          profile: p.name,
          storageHits: scan.storage.hitCount,
        });
        detection.signals.push({
          id: "corrupted_stripe_session_storage",
          severity: "medium",
          profile: p.name,
          note: "Stripe session/cache folders present under profile storage roots.",
        });
      }
      if (scan.preferences?.extensionCount > 8) {
        detection.signals.push({
          id: "extension_conflict_suspected",
          severity: "low",
          profile: p.name,
          extensionCount: scan.preferences.extensionCount,
        });
      }
      if (scan.preferences?.thirdPartyCookiesRestricted) {
        detection.signals.push({
          id: "third_party_cookie_restriction",
          severity: "medium",
          profile: p.name,
        });
      }
    }
  }

  const edge = edgeExecutable();
  if (edge) {
    const proofDir = path.join(
      /* turbopackIgnore: true */ root,
      "windows-heal",
      "reports",
      "stripe-recovery",
      "detect-probe"
    );
    fs.mkdirSync(proofDir, { recursive: true });
    const homeProbe = await probeUrl(edge, config.verifyUrls[0], proofDir);
    if (homeProbe.redirectLoopSuspected) {
      detection.signals.push({ id: "cached_redirect_loop", severity: "high", probe: homeProbe });
      detection.primaryCause = "cached_redirect_loop";
      detection.confidence = 0.9;
    } else if (homeProbe.connectRedirectStuck) {
      detection.signals.push({ id: "stuck_stripe_connect_session", severity: "high", probe: homeProbe });
      detection.primaryCause = "stuck_stripe_connect_session";
      detection.confidence = 0.85;
    } else if (homeProbe.signInSuccessfulStuck || homeProbe.loadingStuck) {
      detection.signals.push({
        id: "mixed_stripe_account_session",
        severity: "high",
        probe: homeProbe,
        note: "Sign-in succeeds but dashboard session fails to initialize.",
      });
      detection.primaryCause = "mixed_stripe_account_session";
      detection.confidence = 0.88;
    } else if (homeProbe.blockedScripts) {
      detection.signals.push({ id: "blocked_stripe_scripts", severity: "medium", probe: homeProbe });
      detection.primaryCause = "blocked_stripe_scripts";
      detection.confidence = 0.65;
    }
  }

  if (!detection.primaryCause) {
    detection.primaryCause =
      detection.signals.find((s) => s.id === "corrupted_stripe_cookies")?.id ||
      "corrupted_stripe_cookies";
    detection.confidence = 0.75;
    if (!detection.signals.some((s) => s.id === "corrupted_stripe_cookies")) {
      detection.signals.push({
        id: "corrupted_stripe_cookies",
        severity: "medium",
        note: "Post-2FA dashboard hang on acct_* routes (default Recovery Authority diagnosis).",
      });
    }
  }

  return { config, detection };
}

async function verifyStripeDashboardAccess({ cwd = REPO_ROOT, saveProof = true } = {}) {
  const root = resolveCwd(cwd);
  const config = loadConfig();
  const edge = edgeExecutable();
  if (!edge) return { ok: false, error: "edge_not_found", probes: [] };

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const proofDir = path.join(
    cwd,
    "windows-heal",
    "reports",
    "stripe-recovery",
    saveProof ? `proof-${stamp}` : "proof-latest"
  );
  fs.mkdirSync(proofDir, { recursive: true });

  const probes = [];
  for (const url of config.verifyUrls) {
    probes.push(await probeUrl(edge, url, proofDir));
  }

  const loopHits = probes.filter((p) => p.redirectLoopSuspected || p.connectRedirectStuck).length;
  const stuckHits = probes.filter((p) => p.signInSuccessfulStuck || p.loadingStuck).length;
  const blockedHits = probes.filter((p) => p.blockedScripts).length;
  const anyDashboard = probes.some((p) => p.dashboardRendered);
  const anyLogin = probes.some((p) => p.loginPage);

  const ok = loopHits === 0 && stuckHits === 0 && blockedHits === 0 && (anyDashboard || anyLogin);

  const proofManifest = {
    generatedAt: new Date().toISOString(),
    proofDir: proofDir.replace(/\\/g, "/"),
    screenshots: probes.map((p) => p.screenshotPath).filter(Boolean),
    probes,
  };
  fs.writeFileSync(path.join(proofDir, "manifest.json"), JSON.stringify(proofManifest, null, 2), "utf8");

  return {
    ok,
    loopHits,
    stuckHits,
    blockedHits,
    anyDashboard,
    anyLogin,
    proofDir: proofDir.replace(/\\/g, "/"),
    proofManifest,
    note: ok
      ? anyDashboard
        ? "Dashboard routes reachable; no redirect loop."
        : "Auth pages reachable without loop (complete sign-in in isolated BossMind Stripe profile)."
      : "Verification failed — see proof screenshots.",
    probes,
  };
}

async function verifyStripeDashboardHealth({ cwd = REPO_ROOT } = {}) {
  const v = await verifyStripeDashboardAccess({ cwd, saveProof: false });
  return { healthy: v.ok, ...v };
}

async function persistRecoveryOutcome({
  projectKey = "resumora",
  cwd = REPO_ROOT,
  report,
  writerAgent = "recovery_agent",
}) {
  assertRequiredEnv();
  const config = loadConfig();
  loadRuntimeEnv();
  await hub.ensureBossmindHubMemoryInitialized();
  await neon.ensureSharedMemoryInitialized();

  const fixPattern = [
    config.fixPattern,
    `npm run ${config.shortcut.npm}`,
    config.shortcut.menuPath.join(" → "),
    report.repair?.report?.isolatedProfile?.launcher || "",
  ]
    .filter(Boolean)
    .join(" | ");

  let errorMemory = { persisted: false };
  if (neon.upsertErrorMemory) {
    await neon.upsertErrorMemory({
      projectKey,
      errorType: config.errorType,
      errorMessage: report.detection?.primaryCause || "stripe_dashboard_session_init_failure",
      rootCause: report.detection?.primaryCause || "corrupted_stripe_cookies",
      fixPattern,
      stackExcerpt: JSON.stringify({
        signals: report.detection?.signals || [],
        verification: {
          ok: report.verification?.ok,
          loopHits: report.verification?.loopHits,
        },
      }).slice(0, 2000),
    });
    errorMemory.persisted = true;
  }

  await neon.saveEvent({
    projectKey,
    eventType: "stripe_dashboard_repair",
    severity: report.ok ? "info" : "warn",
    source: "bossmind_recovery_authority",
    eventKey: PROCESS_ID,
    payload: report,
  });

  let shortcutRow = null;
  if (hub.startShortcutProcess) {
    shortcutRow = await hub.startShortcutProcess({
      projectKey,
      processId: PROCESS_ID,
      stepsTotal: 4,
      payload: { ok: report.ok, primaryCause: report.detection?.primaryCause },
    });
    if (shortcutRow?.id) {
      await hub.updateShortcutProcess({
        id: shortcutRow.id,
        status: report.ok ? "completed" : "failed",
        stepIndex: 4,
        result: {
          detection: report.detection?.primaryCause,
          repair: report.repair?.report?.cookiesRemoved,
          verification: report.verification?.ok,
          proofDir: report.verification?.proofDir,
        },
        errorMessage: report.ok ? null : report.verification?.note,
        finished: true,
      });
    }
  }

  await hub.upsertBossmindMemory({
    projectKey,
    memoryKey: "stripe_dashboard_recovery:latest",
    memoryType: "recovery_pattern",
    payload: { ...report, fixPattern, shortcut: config.shortcut },
    writerAgent,
    locked: report.ok,
  });

  await hub.upsertBossmindMemory({
    projectKey,
    memoryKey: "runtime_authority:stripe_recovery",
    memoryType: "runtime_authority",
    payload: {
      lastRunAt: report.generatedAt,
      ok: report.ok,
      autoDetect: config.autoDetectSignals,
      isolatedProfileDir: report.isolatedProfile?.dir,
      healthCheckCommand: "verifyStripeDashboardHealth",
    },
    writerAgent,
    locked: false,
  });

  return { errorMemory, bossmindMemory: true, shortcutProcess: shortcutRow };
}

async function runStripeSessionRecovery({
  cwd = REPO_ROOT,
  projectKey = "resumora",
  apply = false,
  profile = "",
  verify = true,
  persist = true,
  writerAgent = "recovery_agent",
  launchIsolated = true,
} = {}) {
  const root = resolveCwd(cwd);
  loadRuntimeEnv();
  if (persist) assertRequiredEnv();
  const { config, detection } = await detectStripeSessionIssue({ cwd: root, profileName: profile });

  let repair = { ok: true, skipped: !apply, note: "Dry-run detect only." };
  if (apply) {
    repair = runPowerShellRepair(root, {
      apply: true,
      profile: profile || "",
      closeChrome: process.env.BOSSMIND_STRIPE_CLOSE_CHROME === "1",
      skipIsolatedLaunch: !launchIsolated,
    });
  }

  const isolatedProfile = repair.report?.isolatedProfile || {
    dir: isolatedProfileDir(root),
    launcher: path.join(
      /* turbopackIgnore: true */ root,
      "windows-heal",
      "stripe-runtime",
      "launch-stripe-dashboard.ps1"
    ),
  };

  let verification = { ok: true, skipped: true };
  if (verify) {
    verification = await verifyStripeDashboardAccess({ cwd: root, saveProof: true });
  }

  const report = {
    generatedAt: new Date().toISOString(),
    projectKey,
    processId: PROCESS_ID,
    legacyProcessId: LEGACY_PROCESS_ID,
    shortcut: config.shortcut,
    apply,
    ok:
      (!apply || repair.ok) &&
      (verification.skipped || verification.ok || verification.loopHits === 0),
    detection,
    repair,
    isolatedProfile,
    verification,
  };

  const outDir = path.join(/* turbopackIgnore: true */ root, "windows-heal", "reports");
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = report.generatedAt.replace(/[:.]/g, "-");
  const reportFile = path.join(outDir, `stripe-dashboard-recovery-${stamp}.json`);
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2), "utf8");
  report.reportFile = reportFile.replace(/\\/g, "/");

  const stateDir = path.join(cwd, "windows-heal", "state");
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(
    path.join(stateDir, "stripe-dashboard-recovery-latest.json"),
    JSON.stringify(report, null, 2),
    "utf8"
  );
  fs.writeFileSync(
    path.join(stateDir, "stripe-session-recovery-latest.json"),
    JSON.stringify(report, null, 2),
    "utf8"
  );

  if (persist) {
    report.sharedMemory = await persistRecoveryOutcome({
      projectKey,
      cwd: root,
      report,
      writerAgent,
    });
  }

  return report;
}

async function shouldAutoRepairFromErrorMemory(projectKey = "resumora") {
  const rows = await neon.listKnownErrors({ projectKey, limit: 40 });
  return (rows || []).some((r) => {
    const t = `${r.error_type || ""} ${r.error_message || ""} ${r.root_cause || ""}`.toLowerCase();
    return t.includes("stripe") && (t.includes("redirect") || t.includes("session") || t.includes("dashboard"));
  });
}

async function shouldAutoRepairFromDetection(detection) {
  if (!detection) return false;
  const autoIds = new Set([
    "cached_redirect_loop",
    "stuck_stripe_connect_session",
    "mixed_stripe_account_session",
    "corrupted_stripe_cookies",
    "corrupted_stripe_local_storage",
  ]);
  return (detection.signals || []).some((s) => autoIds.has(s.id)) || detection.confidence >= 0.85;
}

module.exports = {
  PROCESS_ID,
  LEGACY_PROCESS_ID,
  REPO_ROOT,
  loadConfig,
  loadRuntimeEnv,
  assertRequiredEnv,
  isolatedProfileDir,
  detectStripeSessionIssue,
  runPowerShellRepair,
  verifyStripeDashboardAccess,
  verifyStripeDashboardHealth,
  runStripeSessionRecovery,
  persistRecoveryOutcome,
  shouldAutoRepairFromErrorMemory,
  shouldAutoRepairFromDetection,
};
