export const ADMIN_PW_KEY = 'resumora_admin_heal_pw';

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

export async function postAdminHermesCommand(
  password: string,
  body: { projectId: string; message: string; lang?: string; taskType?: string }
) {
  const res = await fetch('/api/admin/hermes-command', {
    method: 'POST',
    headers: adminHeaders(password, true),
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data as { ok?: boolean; reply?: string; engine?: string; projectId?: string };
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
    settings?: {
      autoDeployAfterAck?: boolean;
      createTasksOnLowHealth?: boolean;
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
  body: { autoDeployAfterAck?: boolean; createTasksOnLowHealth?: boolean; healthThreshold?: number }
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
