/**
 * Pure Health Score diagnostic helpers for Admin System Health.
 * Operates on the existing /api/admin/system-health payload — no new APIs.
 */

export type HealthFinding = {
  code?: string;
  severity?: string;
  rcaKey?: string;
  detail?: Record<string, unknown>;
};

export type HealthChecklistItem = {
  id?: string;
  code?: string;
  title?: string;
  hitl?: boolean;
  points?: number | null;
  envKeys?: string[];
  iam?: string[];
  commands?: string[];
  steps?: string[];
  fromGuardian?: boolean;
};

export type HealthScoreInput = {
  score?: number;
  status?: string;
  findings?: HealthFinding[];
  activeRemediations?: string[];
  lastGuardian?: { passed?: boolean; checks?: Record<string, unknown> };
  nextChecklist?: {
    gapTo100?: number | null;
    pointsAtStake?: number;
    hitlRequired?: boolean;
    failedGuardianGates?: string[];
    envKeys?: string[];
    items?: HealthChecklistItem[];
    note?: string;
  } | null;
  healStateMachine?: {
    blocked?: boolean;
    currentPhase?: string | null;
    currentTitle?: string | null;
    lastError?: string | null;
  } | null;
  stripeAccount?: {
    needsAttention?: boolean;
    kycPending?: boolean;
    payoutsEnabled?: boolean;
  } | null;
};

export type ScoreBand = 'critical' | 'degraded' | 'watch' | 'healthy' | 'unknown';

export type DiagnosticCategory = {
  id: string;
  label: string;
  status: 'ok' | 'warn' | 'fail';
  detail: string;
};

export type DiagnosticBlocker = {
  id: string;
  label: string;
  severity: string;
  points?: number | null;
  hitl?: boolean;
};

export type HealthScoreDiagnostic = {
  score: number | null;
  band: ScoreBand;
  bandLabel: string;
  color: string;
  gapTo100: number | null;
  guardianPassed: boolean | null;
  severityCounts: { critical: number; high: number; medium: number; low: number; other: number };
  categories: DiagnosticCategory[];
  blockers: DiagnosticBlocker[];
  summary: string;
};

export function scoreBand(score?: number | null): ScoreBand {
  if (score == null || Number.isNaN(Number(score))) return 'unknown';
  const n = Number(score);
  if (n >= 90) return 'healthy';
  if (n >= 70) return 'watch';
  if (n >= 40) return 'degraded';
  return 'critical';
}

export function scoreBandLabel(band: ScoreBand): string {
  switch (band) {
    case 'healthy':
      return 'Healthy';
    case 'watch':
      return 'Watch';
    case 'degraded':
      return 'Degraded';
    case 'critical':
      return 'Critical';
    default:
      return 'Unknown';
  }
}

export function scoreColor(score?: number | null): string {
  const band = scoreBand(score);
  if (band === 'healthy') return '#3dd68c';
  if (band === 'watch') return '#d4af37';
  if (band === 'degraded') return '#f0a060';
  if (band === 'critical') return '#ff6b6b';
  return '#a89860';
}

function normalizeSeverity(raw?: string): keyof HealthScoreDiagnostic['severityCounts'] {
  const s = String(raw || '')
    .toLowerCase()
    .trim();
  if (s === 'critical' || s === 'fatal') return 'critical';
  if (s === 'high' || s === 'error') return 'high';
  if (s === 'medium' || s === 'warn' || s === 'warning') return 'medium';
  if (s === 'low' || s === 'info') return 'low';
  return 'other';
}

function buildCategories(input: HealthScoreInput): DiagnosticCategory[] {
  const findings = Array.isArray(input.findings) ? input.findings : [];
  const openFindings = findings.length;
  const guardianPassed = input.lastGuardian?.passed;
  const gap = input.nextChecklist?.gapTo100;
  const hitl = Boolean(input.nextChecklist?.hitlRequired);
  const blocked = Boolean(input.healStateMachine?.blocked);
  const stripeAttention = Boolean(input.stripeAccount?.needsAttention);
  const active = Array.isArray(input.activeRemediations) ? input.activeRemediations.length : 0;
  const failedGates = input.nextChecklist?.failedGuardianGates || [];

  return [
    {
      id: 'score',
      label: 'Score band',
      status:
        scoreBand(input.score) === 'healthy'
          ? 'ok'
          : scoreBand(input.score) === 'watch'
            ? 'warn'
            : scoreBand(input.score) === 'unknown'
              ? 'warn'
              : 'fail',
      detail: `${scoreBandLabel(scoreBand(input.score))} · ${input.score ?? '—'} / 100`,
    },
    {
      id: 'guardian',
      label: 'Guardian',
      status: guardianPassed == null ? 'warn' : guardianPassed ? 'ok' : 'fail',
      detail:
        guardianPassed == null
          ? 'No guardian result yet'
          : guardianPassed
            ? 'Passed'
            : failedGates.length
              ? `Failed: ${failedGates.join(', ')}`
              : 'Failed',
    },
    {
      id: 'findings',
      label: 'Findings',
      status: openFindings === 0 ? 'ok' : openFindings <= 2 ? 'warn' : 'fail',
      detail: openFindings === 0 ? 'None open' : `${openFindings} open`,
    },
    {
      id: 'gap',
      label: 'Gap to 100',
      status: gap == null ? 'warn' : gap <= 0 ? 'ok' : gap <= 15 ? 'warn' : 'fail',
      detail: gap == null ? 'Not computed' : `${gap} pts${hitl ? ' · HITL required' : ''}`,
    },
    {
      id: 'remediation',
      label: 'Remediation',
      status: blocked ? 'fail' : active > 0 ? 'warn' : 'ok',
      detail: blocked
        ? input.healStateMachine?.lastError ||
          input.healStateMachine?.currentTitle ||
          'State machine blocked'
        : active > 0
          ? `${active} active`
          : 'Idle',
    },
    {
      id: 'billing',
      label: 'Billing / KYC',
      status: stripeAttention ? 'fail' : 'ok',
      detail: stripeAttention
        ? input.stripeAccount?.kycPending
          ? 'KYC attention needed'
          : 'Stripe needs attention'
        : 'OK',
    },
  ];
}

function buildBlockers(input: HealthScoreInput): DiagnosticBlocker[] {
  const out: DiagnosticBlocker[] = [];
  const items = input.nextChecklist?.items || [];
  for (const item of items.slice(0, 6)) {
    out.push({
      id: `check-${item.id || item.code || item.title || out.length}`,
      label: String(item.title || item.code || 'Checklist item'),
      severity: item.hitl ? 'hitl' : 'checklist',
      points: item.points,
      hitl: Boolean(item.hitl),
    });
  }
  const findings = Array.isArray(input.findings) ? input.findings : [];
  for (const f of findings.slice(0, 6)) {
    out.push({
      id: `finding-${f.code || f.rcaKey || out.length}`,
      label: String(f.code || f.rcaKey || 'Finding'),
      severity: String(f.severity || 'error'),
    });
  }
  return out.slice(0, 8);
}

function buildSummary(diag: Omit<HealthScoreDiagnostic, 'summary'>): string {
  if (diag.score == null) return 'No health score available yet. Run a self-heal cycle.';
  if (diag.band === 'healthy' && diag.blockers.length === 0)
    return 'System score is healthy. No diagnostic blockers detected.';
  const parts: string[] = [`Score ${diag.score}/100 (${diag.bandLabel}).`];
  if (diag.gapTo100 != null && diag.gapTo100 > 0) parts.push(`${diag.gapTo100} points to 100.`);
  if (diag.guardianPassed === false) parts.push('Guardian failed.');
  const failing = diag.categories.filter((c) => c.status === 'fail').map((c) => c.label);
  if (failing.length) parts.push(`Failing: ${failing.join(', ')}.`);
  if (diag.blockers.length) parts.push(`Top blocker: ${diag.blockers[0].label}.`);
  return parts.join(' ');
}

export function buildHealthScoreDiagnostic(
  input: HealthScoreInput | null | undefined
): HealthScoreDiagnostic {
  const safe: HealthScoreInput = input || {};
  const score = safe.score == null || Number.isNaN(Number(safe.score)) ? null : Number(safe.score);
  const band = scoreBand(score);
  const findings = Array.isArray(safe.findings) ? safe.findings : [];
  const severityCounts = { critical: 0, high: 0, medium: 0, low: 0, other: 0 };
  for (const f of findings) {
    severityCounts[normalizeSeverity(f.severity)] += 1;
  }
  const base: Omit<HealthScoreDiagnostic, 'summary'> = {
    score,
    band,
    bandLabel: scoreBandLabel(band),
    color: scoreColor(score),
    gapTo100:
      safe.nextChecklist?.gapTo100 != null
        ? Number(safe.nextChecklist.gapTo100)
        : score != null
          ? Math.max(0, 100 - score)
          : null,
    guardianPassed: safe.lastGuardian?.passed == null ? null : Boolean(safe.lastGuardian.passed),
    severityCounts,
    categories: buildCategories(safe),
    blockers: buildBlockers(safe),
  };
  return { ...base, summary: buildSummary(base) };
}
