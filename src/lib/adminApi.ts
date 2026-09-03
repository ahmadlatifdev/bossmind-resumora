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
