export const ADMIN_PW_KEY = 'resumora_admin_heal_pw';
export const OWNER_MODE_KEY = 'resumora_owner_mode';
export const OWNER_PW_KEY = 'resumora_owner_pw';

export function readAdminPassword(): string {
  try {
    return sessionStorage.getItem(ADMIN_PW_KEY) || '';
  } catch {
    return '';
  }
}

export function writeAdminPassword(value: string): void {
  try {
    if (value) sessionStorage.setItem(ADMIN_PW_KEY, value);
    else sessionStorage.removeItem(ADMIN_PW_KEY);
  } catch {
    /* ignore */
  }
}

export function readOwnerMode(): boolean {
  try {
    return sessionStorage.getItem(OWNER_MODE_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeOwnerMode(on: boolean): void {
  try {
    if (on) sessionStorage.setItem(OWNER_MODE_KEY, '1');
    else sessionStorage.removeItem(OWNER_MODE_KEY);
  } catch {
    /* ignore */
  }
}

export function readOwnerPassword(): string {
  try {
    return sessionStorage.getItem(OWNER_PW_KEY) || '';
  } catch {
    return '';
  }
}

export function writeOwnerPassword(value: string): void {
  try {
    if (value) sessionStorage.setItem(OWNER_PW_KEY, value);
    else sessionStorage.removeItem(OWNER_PW_KEY);
  } catch {
    /* ignore */
  }
}

export function adminHeaders(password: string, json = false): HeadersInit {
  const headers: Record<string, string> = { 'X-Admin-Password': password };
  if (json) headers['Content-Type'] = 'application/json';
  return headers;
}

export async function fetchMasterDashboard(password: string) {
  const res = await fetch('/api/admin/master-dashboard', {
    headers: adminHeaders(password),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `HTTP ${res.status}`);
    (err as Error & { statusCode?: number }).statusCode = res.status;
    throw err;
  }
  return data.dashboard;
}

export async function fetchHermesStatus(password: string) {
  const res = await fetch('/api/admin/hermes-status', {
    headers: adminHeaders(password),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data.status;
}

export async function setHermesChatEnabled(password: string, enabled: boolean) {
  const res = await fetch('/api/admin/hermes-chat', {
    method: 'POST',
    headers: adminHeaders(password, true),
    body: JSON.stringify({ enabled }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data.status;
}

export async function fetchHermesInsights(password: string, lang: string) {
  const res = await fetch(`/api/admin/hermes-insights?lang=${encodeURIComponent(lang)}`, {
    headers: adminHeaders(password),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

export type MasterProject = {
  projectId: string;
  name: string;
  status: string;
  lastDeployTime?: string | null;
  envRegistry?: Record<string, string>;
  healthScore?: number | null;
  tools?: Record<string, boolean>;
  live?: boolean;
  quarantine?: boolean;
  readOnly?: boolean;
};

export async function fetchMasterProjects(password: string) {
  const res = await fetch('/api/admin/master-projects', {
    headers: adminHeaders(password),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data as {
    ok?: boolean;
    generatedAt?: string;
    averageHealth?: number | null;
    projects?: MasterProject[];
  };
}

export async function updateMasterProjectStatus(
  password: string,
  projectId: string,
  status: 'active' | 'paused' | 'building' | 'running' | 'offline',
  source = 'operator'
) {
  const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/status`, {
    method: 'PATCH',
    headers: adminHeaders(password, true),
    body: JSON.stringify({ projectId, status, source }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data as { ok?: boolean; status?: string; project?: MasterProject };
}

/** Owner console — requires ADMIN_REFUND_PASSWORD (server-side only). */
export async function fetchOwnerProjects(ownerPassword: string) {
  const res = await fetch('/api/owner/projects', {
    headers: adminHeaders(ownerPassword),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data as {
    ok?: boolean;
    owner?: boolean;
    projects?: MasterProject[];
    averageHealth?: number | null;
    catalog?: Array<{ projectId: string; name: string } | string>;
  };
}

export async function ownerGlobalHealthCheck(ownerPassword: string) {
  const res = await fetch('/api/owner/projects', {
    method: 'POST',
    headers: adminHeaders(ownerPassword, true),
    body: JSON.stringify({ action: 'globalHealthCheck' }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data as {
    ok?: boolean;
    projects?: MasterProject[];
    globalHealth?: { score?: number | null; status?: string | null };
    logs?: unknown[];
    healSummary?: unknown;
  };
}

export async function ownerReviewUpdateAll(
  ownerPassword: string,
  status: 'active' | 'paused' | 'building' | 'offline' = 'active',
  projectIds?: string[]
) {
  const res = await fetch('/api/owner/projects', {
    method: 'POST',
    headers: adminHeaders(ownerPassword, true),
    body: JSON.stringify({ action: 'reviewUpdateAll', status, projectIds }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data as {
    ok?: boolean;
    projects?: MasterProject[];
    batch?: { projects?: MasterProject[] };
  };
}

export async function ownerSetProjectStatus(
  ownerPassword: string,
  projectId: string,
  status: 'active' | 'paused' | 'building' | 'offline'
) {
  const res = await fetch('/api/owner/projects', {
    method: 'PATCH',
    headers: adminHeaders(ownerPassword, true),
    body: JSON.stringify({ projectId, status, source: 'owner' }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data as { ok?: boolean; status?: string; project?: MasterProject };
}

export async function ownerUpsertProject(
  ownerPassword: string,
  project: Partial<MasterProject> & { projectId: string }
) {
  const res = await fetch('/api/owner/projects', {
    method: 'POST',
    headers: adminHeaders(ownerPassword, true),
    body: JSON.stringify(project),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data as { ok?: boolean; created?: boolean; project?: MasterProject };
}

export async function ownerDeleteProject(ownerPassword: string, projectId: string) {
  const res = await fetch(`/api/owner/projects/${encodeURIComponent(projectId)}`, {
    method: 'DELETE',
    headers: adminHeaders(ownerPassword, true),
    body: JSON.stringify({ projectId }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data as { ok?: boolean; deleted?: string };
}

/** BRoC Mission Control — Level 2: ADMIN_REFUND_PASSWORD via X-Admin-Password. */
export async function fetchBrocStatus(ownerPassword: string) {
  const res = await fetch('/api/admin/broc/status', {
    headers: adminHeaders(ownerPassword),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data as {
    ok?: boolean;
    quarantineActive?: boolean;
    averageHealth?: number | null;
    projects?: MasterProject[];
    backupLog?: Array<Record<string, unknown>>;
    recovery?: { intervalMs?: number; hermesPorts?: number[]; hint?: string };
    globalHealth?: { score?: number | null; status?: string | null };
    healthyRevision?: { revisionId?: string | null; service?: string | null };
    isQuarantined?: boolean;
  };
}

export async function postBrocAction(
  ownerPassword: string,
  action: string,
  body: Record<string, unknown> = {}
) {
  const res = await fetch(`/api/admin/broc/${encodeURIComponent(action)}`, {
    method: 'POST',
    headers: adminHeaders(ownerPassword, true),
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data as Record<string, unknown>;
}

export async function brocLocalBackup(commit = false) {
  const base = String(import.meta.env.VITE_HERMES_API_URL || 'http://127.0.0.1:8790').replace(
    /\/$/,
    ''
  );
  const res = await fetch(`${base}/api/broc/local-backup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ commit }),
    signal: AbortSignal.timeout(120000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data as Record<string, unknown>;
}

export async function brocAutofixHint() {
  const base = String(import.meta.env.VITE_HERMES_API_URL || 'http://127.0.0.1:8790').replace(
    /\/$/,
    ''
  );
  try {
    const res = await fetch(`${base}/api/broc/autofix-hint`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(5000),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) return data as { ok?: boolean; command?: string; message?: string };
  } catch {
    /* fall through */
  }
  return {
    ok: true,
    command: 'npm run dev:all',
    message: 'Hermes local offline — run npm run dev:all to sync Vite + queue.',
  };
}

/** Probe local Hermes HITL/MCP (HERMES_API_URL or defaults). */
export async function probeHermesLocalHealth(): Promise<boolean> {
  const base = String(import.meta.env.VITE_HERMES_API_URL || '').replace(/\/$/, '');
  const urls = [
    base ? `${base}/api/health` : '',
    base ? `${base}/health` : '',
    'http://127.0.0.1:8790/api/health',
    'http://127.0.0.1:8791/health',
  ].filter(Boolean);
  for (const url of urls) {
    try {
      const res = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(3500) });
      if (res.ok) return true;
    } catch {
      /* try next */
    }
  }
  return false;
}

export async function postAdminHermesCommand(
  password: string,
  body: {
    projectId?: string;
    scope?: 'global' | 'project';
    message: string;
    lang?: string;
    taskType?: string;
    codeDiff?: string;
    codePatch?: string;
  }
) {
  const res = await fetch('/api/admin/hermes-command', {
    method: 'POST',
    headers: adminHeaders(password, true),
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data as {
    ok?: boolean;
    reply?: string;
    engine?: string;
    projectId?: string;
    patchStored?: boolean;
  };
}

export type HarnessTask = {
  id: string;
  description?: string;
  status?: string;
  codeDiff?: string;
  commands?: string[];
  projectId?: string;
  actor?: string;
  risk?: string;
  logs?: string[];
  autoDeployEligible?: boolean;
  lastKnownHealthyRevision?: string | null;
  lastKnownHealthyService?: string | null;
  isSample?: boolean;
  createdAt?: string;
  updatedAt?: string;
  deployRunUrl?: string | null;
};

export async function fetchHarnessTasks(password: string, status?: string) {
  const q = status ? `?status=${encodeURIComponent(status)}` : '';
  const res = await fetch(`/api/admin/tasks${q}`, {
    headers: adminHeaders(password),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data as {
    ok?: boolean;
    tasks?: HarnessTask[];
    isQuarantined?: boolean;
    healthyRevision?: {
      revisionId?: string | null;
      service?: string | null;
      capturedAt?: string | null;
    };
    settings?: {
      autoDeployAfterAck?: boolean;
      createTasksOnLowHealth?: boolean;
      allowSampleTasks?: boolean;
      healthThreshold?: number;
    };
  };
}

export async function createHarnessTask(
  password: string,
  body: {
    description: string;
    codeDiff?: string;
    commands?: string[];
    projectId?: string;
    actor?: string;
    risk?: string;
  }
) {
  const res = await fetch('/api/admin/tasks/create', {
    method: 'POST',
    headers: adminHeaders(password, true),
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data as { ok?: boolean; task?: HarnessTask };
}

export async function ackHarnessTask(
  password: string,
  body: { taskId: string; ack?: boolean; reject?: boolean; note?: string }
) {
  const res = await fetch('/api/admin/tasks/ack', {
    method: 'POST',
    headers: adminHeaders(password, true),
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data as { ok?: boolean; task?: HarnessTask };
}

export async function markHarnessTaskApplied(password: string, taskId: string, log?: string) {
  const res = await fetch('/api/admin/tasks/mark-applied', {
    method: 'POST',
    headers: adminHeaders(password, true),
    body: JSON.stringify({ taskId, log }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data as { ok?: boolean; task?: HarnessTask };
}

export async function setHarnessAutomation(
  password: string,
  body: {
    autoDeployAfterAck?: boolean;
    createTasksOnLowHealth?: boolean;
    allowSampleTasks?: boolean;
    healthThreshold?: number;
  }
) {
  const res = await fetch('/api/admin/tasks/automation', {
    method: 'POST',
    headers: adminHeaders(password, true),
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data as { ok?: boolean; settings?: Record<string, unknown> };
}

export async function fetchAdminFinancials(password: string) {
  const res = await fetch('/api/admin/financials', {
    headers: adminHeaders(password),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data as {
    ok?: boolean;
    financials?: import('../components/FinancialDashboard').FinancialDashboard;
  };
}

export type FinanceOverview = {
  generatedAt?: string;
  currency?: string;
  filters?: { projectId?: string; fromMonth?: string; toMonth?: string };
  settings?: {
    taxRatePct?: number;
    stockAllocationPct?: number;
    allocationEnabled?: boolean;
    avgUnitRevenueCents?: number;
    taxRegions?: Record<string, number>;
  };
  summary?: {
    month?: {
      revenueCents: number;
      costCents: number;
      taxCents: number;
      netProfitCents: number;
    };
    cumulative?: {
      revenueCents: number;
      costCents: number;
      taxCents: number;
      netProfitCents: number;
      allocatedToStockCents: number;
    };
    allocatedToStockCents?: number;
  };
  projects?: Array<{
    projectId: string;
    name: string;
    revenueCents: number;
    costCents: number;
    taxCents: number;
    netProfitCents: number;
    profitMarginPct?: number | null;
    momGrowthPct?: number;
    costsByCategory?: Record<string, number>;
    allocatedToStockCents?: number;
    monthly?: {
      revenueCents: number;
      costCents: number;
      taxCents: number;
      netProfitCents: number;
    };
    cumulative?: {
      revenueCents: number;
      costCents: number;
      taxCents: number;
      netProfitCents: number;
    };
    breakEvenUnits?: number;
    trend?: Array<{
      monthKey: string;
      revenueCents: number;
      costCents: number;
      taxCents: number;
      netProfitCents: number;
    }>;
  }>;
  pnl?: Array<Record<string, unknown>>;
  costDistribution?: Array<{ category: string; amountCents: number }>;
  trends?: {
    revenueProfit?: Array<{
      monthKey: string;
      revenueCents: number;
      netProfitCents: number;
      costCents?: number;
      allocatedCents?: number;
    }>;
    allocation?: Array<{ monthKey: string; allocatedCents: number }>;
  };
  allocationHistory?: Array<{
    id?: string;
    date?: string | null;
    sourceProjectId?: string;
    sourceProjectName?: string;
    amountCents?: number;
    destinationProjectId?: string;
  }>;
  analytics?: {
    forecast?: { nextQuarterRevenueCents?: number; slope?: number };
    taxByRegion?: Record<string, { ratePct: number; estimatedTaxCents: number }>;
    breakEven?: Array<{
      projectId: string;
      name: string;
      breakEvenUnits: number;
      avgUnitRevenueCents: number;
      costCents: number;
    }>;
    cashFlow?: {
      actualNetCents?: number;
      projectedNextQuarterRevenueCents?: number;
      note?: string;
    };
  };
};

export async function fetchFinanceOverview(
  password: string,
  opts?: { projectId?: string; fromMonth?: string; toMonth?: string }
) {
  const q = new URLSearchParams({ view: 'overview' });
  if (opts?.projectId) q.set('projectId', opts.projectId);
  if (opts?.fromMonth) q.set('from', opts.fromMonth);
  if (opts?.toMonth) q.set('to', opts.toMonth);
  const res = await fetch(`/api/admin/financials/overview?${q}`, {
    headers: adminHeaders(password),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data as { ok?: boolean; overview?: FinanceOverview; fx?: Record<string, number> };
}

export async function exportFinanceCsv(
  password: string,
  opts?: { projectId?: string; fromMonth?: string; toMonth?: string }
) {
  const q = new URLSearchParams({ view: 'export' });
  if (opts?.projectId) q.set('projectId', opts.projectId);
  if (opts?.fromMonth) q.set('from', opts.fromMonth);
  if (opts?.toMonth) q.set('to', opts.toMonth);
  const res = await fetch(`/api/admin/financials/export?${q}`, {
    headers: adminHeaders(password),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return res.text();
}

export async function updateFinanceSettings(
  password: string,
  body: {
    taxRatePct?: number;
    stockAllocationPct?: number;
    allocationEnabled?: boolean;
    avgUnitRevenueCents?: number;
    taxRegions?: { US?: number; EU?: number; CA?: number };
  }
) {
  const res = await fetch('/api/admin/financials/settings', {
    method: 'POST',
    headers: adminHeaders(password, true),
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data as { ok?: boolean; settings?: Record<string, unknown> };
}

export async function runFinanceAllocation(password: string) {
  const res = await fetch('/api/admin/financials/allocate', {
    method: 'POST',
    headers: adminHeaders(password, true),
    body: '{}',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data as {
    ok?: boolean;
    skipped?: boolean;
    reason?: string;
    transfers?: Array<{ from: string; to: string; amountCents: number }>;
  };
}

export async function requestAdminPasswordReset() {
  const res = await fetch('/api/admin/password-reset/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data as { ok?: boolean; emailed?: boolean; hint?: string; expiresInMinutes?: number };
}

export async function confirmAdminPasswordReset(code: string, newPassword: string) {
  const res = await fetch('/api/admin/password-reset/confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, newPassword }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data as { ok?: boolean };
}
