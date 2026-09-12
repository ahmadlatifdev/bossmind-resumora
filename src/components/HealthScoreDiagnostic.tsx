import { buildHealthScoreDiagnostic, type HealthScoreInput } from '../lib/healthScoreDiagnostic';

type Props = {
  health: HealthScoreInput | null;
};

export default function HealthScoreDiagnostic({ health }: Props) {
  const diag = buildHealthScoreDiagnostic(health);
  const pct = diag.score == null ? 0 : Math.max(0, Math.min(100, diag.score));

  return (
    <div className="health-score-diagnostic" aria-label="Health score diagnostic">
      <div className="health-score-diagnostic__meter" aria-hidden="true">
        <div
          className="health-score-diagnostic__meter-fill"
          style={{ width: `${pct}%`, background: diag.color }}
        />
      </div>
      <p className="health-score-diagnostic__summary">{diag.summary}</p>
      <ul className="health-score-diagnostic__cats">
        {diag.categories.map((cat) => (
          <li
            key={cat.id}
            className={`health-score-diagnostic__cat health-score-diagnostic__cat--${cat.status}`}
          >
            <span className="health-score-diagnostic__cat-label">{cat.label}</span>
            <span className="health-score-diagnostic__cat-detail">{cat.detail}</span>
          </li>
        ))}
      </ul>
      <div className="health-score-diagnostic__sev" aria-label="Finding severity counts">
        <span>Critical {diag.severityCounts.critical}</span>
        <span>High {diag.severityCounts.high}</span>
        <span>Medium {diag.severityCounts.medium}</span>
        <span>Low {diag.severityCounts.low}</span>
        {diag.severityCounts.other ? <span>Other {diag.severityCounts.other}</span> : null}
      </div>
      {diag.blockers.length ? (
        <div className="health-score-diagnostic__blockers">
          <h3 className="health-score-diagnostic__blockers-title">Top diagnostic blockers</h3>
          <ol>
            {diag.blockers.map((b) => (
              <li key={b.id}>
                <strong>{b.label}</strong>
                <span className="health-score-diagnostic__blocker-meta">
                  {' '}
                  · {b.severity}
                  {b.points != null ? ` · +${b.points} pts` : ''}
                  {b.hitl ? ' · HITL' : ''}
                </span>
              </li>
            ))}
          </ol>
        </div>
      ) : (
        <p className="health-score-diagnostic__none">No diagnostic blockers listed.</p>
      )}
    </div>
  );
}
