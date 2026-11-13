import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useAdminAuth } from './AdminAuthGate';
import { fetchOrchestratorCatalog, type OrchestratorProject } from '../lib/orchestratorSync';

const thStyle: CSSProperties = {
  borderBottom: '1px solid var(--color-gold-border)',
  padding: '6px 8px',
  textAlign: 'left',
};
const tdStyle: CSSProperties = {
  borderBottom: '1px solid rgba(212, 175, 55, 0.15)',
  padding: '6px 8px',
};

export default function OrchestratorView() {
  const { ownerMode, ownerPassword } = useAdminAuth();
  const [projects, setProjects] = useState<OrchestratorProject[]>([]);
  const [selectedId, setSelectedId] = useState('resumora');
  const [viewTierId, setViewTierId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!ownerMode || !ownerPassword) return;
    let cancelled = false;
    setBusy(true);
    setError('');
    fetchOrchestratorCatalog(ownerPassword)
      .then((data) => {
        if (cancelled) return;
        const list = data.projects || [];
        setProjects(list);
        const active = list.find((p) => p.id === selectedId) || list[0] || null;
        if (active) {
          setSelectedId(active.id);
          setViewTierId((prev) =>
            active.tiers.some((t) => t.id === prev) ? prev : active.tiers[0]?.id || null
          );
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load catalog');
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ownerMode, ownerPassword]);

  const selected = projects.find((p) => p.id === selectedId) || projects[0] || null;
  const viewTier = selected?.tiers.find((t) => t.id === viewTierId) || selected?.tiers[0] || null;

  const allFeatures = useMemo(() => {
    if (!selected) return [];
    const set = new Set<string>();
    selected.tiers.forEach((t) => t.features.forEach((f) => set.add(f)));
    return [...set];
  }, [selected]);

  if (!ownerMode) {
    return (
      <div className="admin-master__card">
        <h2>Orchestrator — God View</h2>
        <p className="admin-master__lead">
          Enable Owner Mode to review benefits &amp; features across the BossMind ecosystem.
        </p>
      </div>
    );
  }

  return (
    <div className="admin-master__card">
      <h2>Orchestrator — Benefits &amp; Features</h2>

      <label style={{ display: 'block', marginTop: 12 }}>
        <span style={{ fontWeight: 700 }}>Project</span>
        <select
          value={selected?.id || ''}
          onChange={(e) => {
            setSelectedId(e.target.value);
            setViewTierId(null);
          }}
          style={{ display: 'block', marginTop: 4, minWidth: 240, padding: '6px 8px' }}
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>

      <div style={{ marginTop: 16 }}>
        <span style={{ fontWeight: 700 }}>View as (user tier): </span>
        {selected?.tiers.map((t) => (
          <button
            key={t.id}
            type="button"
            className="admin-master__btn"
            onClick={() => setViewTierId(t.id)}
            style={{ marginRight: 8, marginTop: 4, opacity: viewTier?.id === t.id ? 1 : 0.65 }}
          >
            {t.name} {t.price}
          </button>
        ))}
      </div>

      {error ? <p className="admin-master__error">{error}</p> : null}
      {busy ? <p className="admin-master__lead">Loading…</p> : null}

      {selected && viewTier ? (
        <>
          <h3 style={{ marginTop: 20 }}>
            {selected.name} — {viewTier.name} ({viewTier.price})
          </h3>
          <table style={{ borderCollapse: 'collapse', marginTop: 8, width: '100%' }}>
            <thead>
              <tr>
                <th style={thStyle}>Capability</th>
                <th style={thStyle}>{viewTier.name} unlocks</th>
              </tr>
            </thead>
            <tbody>
              {allFeatures.map((f) => (
                <tr key={f}>
                  <td style={tdStyle}>{f}</td>
                  <td style={tdStyle}>{viewTier.features.includes(f) ? 'Included' : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3 style={{ marginTop: 20 }}>Feature Flags</h3>
          <ul style={{ marginTop: 8 }}>
            {selected.featureFlags.map((f) => (
              <li key={f.key}>
                {f.label} — {f.enabled ? 'enabled' : 'disabled'}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}
