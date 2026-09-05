/**
 * Aggregates admin-only Resumora ops metrics. Never logs secret values.
 */
const { getAuth } = require('firebase-admin/auth');
const { getStripeClient } = require('./stripeSecrets');

const OTHER_PROJECTS = Object.freeze([
  {
    id: 'bossmind-orchestrator',
    name: 'BossMind-Orchestrator',
    runtime: 'catalog',
    note: 'Separate BossMind process — not queried from Resumora Functions.',
  },
]);

function dayKey(tsSec) {
  return new Date(tsSec * 1000).toISOString().slice(0, 10);
}

function emptySeries(days) {
  const out = [];
  const now = new Date();
  now.setUTCHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    out.push({ date: d.toISOString().slice(0, 10), revenueCents: 0, signups: 0 });
  }
  return out;
}

function statusFromScore(score, healthStatus) {
  const n = Number(score);
  if (healthStatus === 'offline' || Number.isNaN(n)) return 'offline';
  if (n >= 80) return 'active';
  if (n >= 50) return 'degraded';
  return 'offline';
}

async function countAuthUsers() {
  try {
    const page = await getAuth().listUsers(1000);
    return page.users.length;
  } catch {
    return null;
  }
}

async function listPendingRefundDocs(db) {
  try {
    const snap = await db
      .collection('refund_requests')
      .where('status', '==', 'pending_approval')
      .limit(25)
      .get();
    return snap.docs.map((doc) => {
      const d = doc.data() || {};
      return {
        id: doc.id,
        status: d.status || 'pending_approval',
        createdAt:
          d.createdAt && d.createdAt.toDate
            ? d.createdAt.toDate().toISOString()
            : d.createdAt || null,
        amountCents: Number(d.amount || d.amountCents || 0) || null,
      };
    });
  } catch {
    return [];
  }
}

async function collectStripeMetrics(days) {
  const stripe = getStripeClient();
  const series = emptySeries(days);
  const index = new Map(series.map((row, i) => [row.date, i]));
  const sinceSec = Math.floor(Date.now() / 1000) - days * 86400;
  const empty = {
    configured: Boolean(stripe),
    revenueCents30d: 0,
    revenueCentsTotalApprox: 0,
    signups30d: 0,
    refunds: [],
    series,
  };
  if (!stripe) return empty;

  let revenueCents30d = 0;
  let signups30d = 0;
  const refunds = [];

  try {
    const charges = await stripe.charges.list({
      created: { gte: sinceSec },
      limit: 100,
    });
    for (const ch of charges.data) {
      if (!ch.paid || ch.refunded) continue;
      const cents = Number(ch.amount || 0) - Number(ch.amount_refunded || 0);
      revenueCents30d += cents;
      const key = dayKey(ch.created);
      const idx = index.get(key);
      if (idx != null) series[idx].revenueCents += cents;
    }
  } catch {
    /* Stripe charge list optional */
  }

  try {
    const customers = await stripe.customers.list({
      created: { gte: sinceSec },
      limit: 100,
    });
    signups30d = customers.data.length;
    for (const c of customers.data) {
      const key = dayKey(c.created);
      const idx = index.get(key);
      if (idx != null) series[idx].signups += 1;
    }
  } catch {
    /* optional */
  }

  try {
    const rf = await stripe.refunds.list({ limit: 12 });
    for (const r of rf.data) {
      refunds.push({
        id: r.id ? String(r.id).slice(0, 12) : 'refund',
        status: r.status || 'unknown',
        amountCents: Number(r.amount || 0),
        createdAt: r.created ? new Date(r.created * 1000).toISOString() : null,
        source: 'stripe',
      });
    }
  } catch {
    /* optional */
  }

  let revenueCentsTotalApprox = revenueCents30d;
  try {
    const bal = await stripe.balanceTransactions.list({ limit: 1 });
    if (bal.data[0] && typeof bal.data[0].amount === 'number') {
      revenueCentsTotalApprox = revenueCents30d;
    }
  } catch {
    /* keep 30d as total fallback */
  }

  return {
    configured: true,
    revenueCents30d,
    revenueCentsTotalApprox,
    signups30d,
    refunds,
    series,
  };
}

async function buildMasterDashboard(db, snapshot) {
  const health = snapshot.health || {};
  const score = Number(health.score);
  const resumoraStatus = statusFromScore(score, health.status);
  const [authUsers, pendingRefunds, stripe] = await Promise.all([
    countAuthUsers(),
    listPendingRefundDocs(db),
    collectStripeMetrics(30),
  ]);

  const feed = [];
  for (const r of pendingRefunds) {
    feed.push({
      kind: 'refund',
      id: r.id,
      title: 'Pending refund',
      status: r.status,
      at: r.createdAt,
    });
  }
  for (const inc of (snapshot.incidents || []).slice(0, 8)) {
    const findings = Array.isArray(inc.findings) ? inc.findings : [];
    const summary =
      findings
        .slice(0, 3)
        .map((f) => f.code || f.severity || f.message)
        .filter(Boolean)
        .join(', ') ||
      inc.status ||
      'incident';
    feed.push({
      kind: 'incident',
      id: inc.id,
      title: summary,
      status: inc.status || 'open',
      at: inc.createdAt || null,
      score: inc.score,
      description: summary,
      requiresHumanReview: Boolean(inc.requiresHumanReview),
      cycleId: inc.cycleId || null,
    });
  }
  for (const n of (snapshot.notificationHistory || []).slice(0, 6)) {
    feed.push({
      kind: 'alert',
      id: n.id,
      title: n.type || n.key || 'alert',
      status: n.type || 'notice',
      at: n.createdAt || n.lastSentAt || null,
    });
  }
  feed.sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));

  const projects = [
    {
      id: 'resumora',
      name: 'Resumora',
      status: resumoraStatus,
      revenueCentsMonthly: stripe.revenueCents30d,
      revenueCentsTotal: stripe.revenueCentsTotalApprox,
      activeUsers: authUsers,
      uptimeLabel: health.status || resumoraStatus,
      healthScore: Number.isFinite(score) ? score : null,
      live: true,
    },
    ...OTHER_PROJECTS.map((p) => ({
      id: p.id,
      name: p.name,
      status: 'catalog',
      revenueCentsMonthly: null,
      revenueCentsTotal: null,
      activeUsers: null,
      uptimeLabel: p.note,
      healthScore: null,
      live: false,
    })),
  ];

  return {
    generatedAt: new Date().toISOString(),
    globalHealth: {
      score: Number.isFinite(score) ? score : null,
      status: health.status || 'unknown',
      updatedAt: health.updatedAt || null,
    },
    projects,
    analytics: {
      days: 30,
      series: stripe.series,
      revenueCents30d: stripe.revenueCents30d,
      signups30d: stripe.signups30d,
      stripeConfigured: stripe.configured,
    },
    refunds: {
      pending: pendingRefunds,
      recent: stripe.refunds,
    },
    feed: feed.slice(0, 20),
    criticalAlertCount: snapshot.criticalAlertCount || 0,
    pendingHealApprovals: (snapshot.pendingApprovals || []).length,
  };
}

module.exports = { buildMasterDashboard };
