import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getLang, t } from '../lib/i18n.js';

const HEALTH_URL = '/api/admin/system-health';
const HEAL_SESSION_KEY = 'resumora_admin_heal_pw';
const REFUND_SESSION_KEY = 'resumora_admin_refund_pw';
const POLL_MS = 60_000;

type CriticalAlerts = {
  pendingApprovals?: number;
  circuitBreakers?: number;
  humanReviewIncidents?: number;
  pendingRefunds?: number;
  failedPublishJobs?: number;
  stripeKyc?: number;
};

function resolveAdminPassword(): string {
  return (
    sessionStorage.getItem(HEAL_SESSION_KEY) ||
    sessionStorage.getItem(REFUND_SESSION_KEY) ||
    ''
  ).trim();
}

function resolveTargetPath(alerts: CriticalAlerts | null): string {
  if (!alerts) return '/admin/system-health';
  const healItems =
    (alerts.pendingApprovals || 0) +
    (alerts.circuitBreakers || 0) +
    (alerts.humanReviewIncidents || 0) +
    (alerts.failedPublishJobs || 0) +
    (alerts.stripeKyc || 0);
  const refundItems = alerts.pendingRefunds || 0;
  if (refundItems > 0 && healItems === 0) return '/admin/refunds';
  return '/admin/system-health';
}

export default function AdminCriticalAlert() {
  const navigate = useNavigate();
  const lang = getLang();
  const [count, setCount] = useState(0);
  const [targetPath, setTargetPath] = useState('/admin/system-health');

  const refresh = useCallback(async () => {
    const password = resolveAdminPassword();
    if (!password) {
      setCount(0);
      return;
    }
    try {
      const res = await fetch(HEALTH_URL, {
        headers: { 'X-Admin-Password': password },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCount(0);
        return;
      }
      const total = typeof data.criticalAlertCount === 'number' ? data.criticalAlertCount : 0;
      setCount(Math.max(0, total));
      setTargetPath(resolveTargetPath(data.criticalAlerts as CriticalAlerts));
    } catch {
      setCount(0);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), POLL_MS);
    return () => window.clearInterval(timer);
  }, [refresh]);

  if (count <= 0) return null;

  const label = t(lang, 'admin.alertAria').replace('{n}', String(count));
  const labelText = t(lang, 'admin.alertLabel').replace('{n}', String(count));

  return (
    <button
      type="button"
      className="critical-alert-button"
      aria-label={label}
      onClick={() => navigate(targetPath)}
    >
      {labelText}
    </button>
  );
}
