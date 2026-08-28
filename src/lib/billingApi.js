/**
 * Client helpers for refund preview, cancel, service events, refund history.
 */

const BILLING_BASES = ['/api', 'https://resumora.net/api'];

async function authHeaders() {
  try {
    const { auth } = await import('./firebase');
    const user = auth.currentUser;
    if (!user) return {};
    const token = await user.getIdToken();
    return { Authorization: `Bearer ${token}` };
  } catch {
    return {};
  }
}

async function fetchBilling(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(await authHeaders()),
    ...(options.headers || {}),
  };
  let lastError = '';
  for (const base of BILLING_BASES) {
    try {
      const res = await fetch(`${base}${path}`, { ...options, headers });
      const data = await res.json().catch(() => ({}));
      if (res.ok) return data;
      lastError = data.error || `HTTP ${res.status}`;
    } catch (err) {
      lastError = err?.message || 'Network error';
    }
  }
  throw new Error(lastError || 'Billing API unavailable');
}

export async function getRefundPreview(params = {}) {
  const qs = new URLSearchParams();
  if (params.customerId) qs.set('customerId', params.customerId);
  if (params.subscriptionId) qs.set('subscriptionId', params.subscriptionId);
  if (params.planId) qs.set('planId', params.planId);
  if (params.totalPaidCents) qs.set('totalPaidCents', String(params.totalPaidCents));
  const q = qs.toString();
  return fetchBilling(`/refund-preview${q ? `?${q}` : ''}`, { method: 'GET' });
}

export async function cancelSubscription(body = {}) {
  return fetchBilling('/cancel-subscription', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function listRefundHistory(params = {}) {
  const qs = new URLSearchParams();
  if (params.customerId) qs.set('customerId', params.customerId);
  return fetchBilling(`/refunds${qs.toString() ? `?${qs}` : ''}`, { method: 'GET' });
}

export async function recordClientServiceEvent(eventType, metadata = {}) {
  try {
    return await fetchBilling('/service-event', {
      method: 'POST',
      body: JSON.stringify({
        eventType,
        metadata,
        customerId: metadata.customerId,
        subscriptionId: metadata.subscriptionId,
      }),
    });
  } catch (err) {
    console.warn('[service-event]', err.message);
    return { ok: false, error: err.message };
  }
}
