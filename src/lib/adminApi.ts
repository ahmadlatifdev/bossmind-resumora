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
