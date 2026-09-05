/**
 * Financial ledger helpers (Firestore `financials`).
 * Amounts in USD cents. Never log secret payment IDs.
 */
const { FieldValue, Timestamp } = require('firebase-admin/firestore');

const COLLECTION = 'financials';
const SETTINGS_DOC = ['admin_settings', 'finance'];
const PROJECT_IDS = Object.freeze([
  'resumora',
  'elegancyart',
  'ai-video',
  'tiktok-ai',
  'global-stock',
]);

const PROJECT_NAMES = Object.freeze({
  resumora: 'Resumora',
  elegancyart: 'ElegancyArt',
  'ai-video': 'AI Video Generator',
  'tiktok-ai': 'TikTok AI',
  'global-stock': 'Global Stock Trade',
});

function taxRatePct() {
  const n = Number(process.env.FINANCE_TAX_RATE_PCT || 20);
  return Number.isFinite(n) && n >= 0 && n <= 60 ? n : 20;
}

function allocationPct() {
  const n = Number(process.env.FINANCE_STOCK_ALLOCATION_PCT || 10);
  return Number.isFinite(n) && n >= 0 && n <= 50 ? n : 10;
}

function monthKey(d = new Date()) {
  return d.toISOString().slice(0, 7);
}

function dayKey(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

async function readFinanceSettings(db) {
  const snap = await db.doc(SETTINGS_DOC.join('/')).get();
  const data = snap.exists ? snap.data() || {} : {};
  return {
    taxRatePct: Number.isFinite(Number(data.taxRatePct)) ? Number(data.taxRatePct) : taxRatePct(),
    stockAllocationPct: Number.isFinite(Number(data.stockAllocationPct))
      ? Number(data.stockAllocationPct)
      : allocationPct(),
    allocationEnabled: data.allocationEnabled !== false,
  };
}

/**
 * Seed demo/operating ledger rows for Resumora when empty (idempotent).
 * Other catalog projects get zeroed placeholders only.
 */
async function ensureSeedFinancials(db) {
  const sample = await db.collection(COLLECTION).limit(1).get();
  if (!sample.empty) return { seeded: false };

  const now = new Date();
  const batch = db.batch();
  const mk = monthKey(now);
  const rows = [
    {
      projectId: 'resumora',
      type: 'revenue',
      category: 'subscriptions',
      amountCents: 0,
      description: 'Stripe subscriptions (live totals sync separately)',
    },
    {
      projectId: 'resumora',
      type: 'cost',
      category: 'hosting',
      amountCents: 0,
      description: 'Firebase / Cloud Run hosting',
    },
    {
      projectId: 'resumora',
      type: 'cost',
      category: 'stripe_fees',
      amountCents: 0,
      description: 'Stripe processing fees',
    },
  ];
  for (const row of rows) {
    const ref = db.collection(COLLECTION).doc();
    batch.set(ref, {
      ...row,
      currency: 'USD',
      monthKey: mk,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      source: 'seed',
    });
  }
  await batch.commit();
  return { seeded: true };
}

/**
 * Pull Resumora revenue hint from dashboard analytics (cents) into a month snapshot doc.
 */
async function syncResumoraRevenueHint(db, revenueCents30d) {
  const cents = Number(revenueCents30d);
  if (!Number.isFinite(cents) || cents < 0) return;
  const mk = monthKey();
  const docId = `sync-resumora-revenue-${mk}`;
  await db
    .collection(COLLECTION)
    .doc(docId)
    .set(
      {
        projectId: 'resumora',
        type: 'revenue',
        category: 'subscriptions',
        amountCents: Math.round(cents),
        currency: 'USD',
        monthKey: mk,
        description: 'Synced 30d revenue hint from Master Dashboard analytics',
        source: 'dashboard_sync',
        updatedAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
}

async function listLedger(db, { sinceDays = 93 } = {}) {
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
  let snap;
  try {
    snap = await db
      .collection(COLLECTION)
      .where('createdAt', '>=', Timestamp.fromDate(since))
      .orderBy('createdAt', 'desc')
      .limit(2000)
      .get();
  } catch {
    snap = await db.collection(COLLECTION).limit(2000).get();
  }
  return snap.docs.map((d) => {
    const data = d.data() || {};
    return {
      id: d.id,
      ...data,
      createdAt:
        data.createdAt && data.createdAt.toDate
          ? data.createdAt.toDate().toISOString()
          : data.createdAt || null,
    };
  });
}

function summarizeProject(projectId, rows, settings) {
  const name = PROJECT_NAMES[projectId] || projectId;
  let revenueCents = 0;
  let costCents = 0;
  let taxPostedCents = 0;
  let allocatedOutCents = 0;
  let allocatedInCents = 0;
  const byCategory = {};
  const months = {};

  for (const row of rows) {
    if (row.projectId !== projectId) continue;
    const amt = Math.round(Number(row.amountCents) || 0);
    const mk = row.monthKey || (row.createdAt ? String(row.createdAt).slice(0, 7) : monthKey());
    if (!months[mk]) months[mk] = { revenueCents: 0, costCents: 0, taxCents: 0, profitCents: 0 };

    if (row.type === 'revenue') {
      revenueCents += amt;
      months[mk].revenueCents += amt;
      if (row.category === 'stock_allocation_in') allocatedInCents += amt;
    } else if (row.type === 'cost') {
      costCents += amt;
      months[mk].costCents += amt;
      const cat = String(row.category || 'other');
      byCategory[cat] = (byCategory[cat] || 0) + amt;
      if (cat === 'stock_allocation_out') allocatedOutCents += amt;
    } else if (row.type === 'tax') {
      taxPostedCents += amt;
      months[mk].taxCents += amt;
    }
  }

  const pretax = revenueCents - costCents;
  const taxRate = settings.taxRatePct / 100;
  const taxEstimatedCents =
    taxPostedCents > 0 ? taxPostedCents : pretax > 0 ? Math.round(pretax * taxRate) : 0;
  const netProfitCents = pretax - taxEstimatedCents;

  const trend = Object.keys(months)
    .sort()
    .slice(-3)
    .map((mk) => {
      const m = months[mk];
      const pre = m.revenueCents - m.costCents;
      const tax = m.taxCents > 0 ? m.taxCents : pre > 0 ? Math.round(pre * taxRate) : 0;
      return {
        monthKey: mk,
        revenueCents: m.revenueCents,
        costCents: m.costCents,
        taxCents: tax,
        netProfitCents: pre - tax,
      };
    });

  return {
    projectId,
    name,
    revenueCents,
    costCents,
    taxCents: taxEstimatedCents,
    netProfitCents,
    costsByCategory: byCategory,
    allocatedToStockCents: allocatedOutCents,
    allocatedFromProjectsCents: allocatedInCents,
    trend,
  };
}

async function buildFinancialDashboard(db, { revenueCents30d } = {}) {
  await ensureSeedFinancials(db);
  if (revenueCents30d != null) {
    await syncResumoraRevenueHint(db, revenueCents30d);
  }
  const settings = await readFinanceSettings(db);
  const rows = await listLedger(db);
  const projects = PROJECT_IDS.map((id) => summarizeProject(id, rows, settings));
  const totals = projects.reduce(
    (acc, p) => {
      acc.revenueCents += p.revenueCents;
      acc.costCents += p.costCents;
      acc.taxCents += p.taxCents;
      acc.netProfitCents += p.netProfitCents;
      acc.allocatedToStockCents += p.allocatedToStockCents;
      return acc;
    },
    {
      revenueCents: 0,
      costCents: 0,
      taxCents: 0,
      netProfitCents: 0,
      allocatedToStockCents: 0,
    }
  );
  return {
    generatedAt: new Date().toISOString(),
    currency: 'USD',
    settings: {
      taxRatePct: settings.taxRatePct,
      stockAllocationPct: settings.stockAllocationPct,
      allocationEnabled: settings.allocationEnabled,
    },
    projects,
    totals,
  };
}

module.exports = {
  COLLECTION,
  PROJECT_IDS,
  PROJECT_NAMES,
  taxRatePct,
  allocationPct,
  monthKey,
  dayKey,
  readFinanceSettings,
  ensureSeedFinancials,
  syncResumoraRevenueHint,
  listLedger,
  buildFinancialDashboard,
  summarizeProject,
};
