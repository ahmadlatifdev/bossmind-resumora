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

const DEFAULT_COST_CATEGORIES = Object.freeze([
  'subscriptions',
  'stripe_fees',
  'hosting',
  'ai_api',
  'content',
  'stock_allocation_out',
  'stock_allocation_in',
  'other',
]);

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

function shiftMonthKey(mk, delta) {
  const [y, m] = String(mk || monthKey())
    .split('-')
    .map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

function monthKeysBetween(fromMk, toMk) {
  const out = [];
  let cur = fromMk;
  for (let i = 0; i < 36; i += 1) {
    out.push(cur);
    if (cur === toMk) break;
    cur = shiftMonthKey(cur, 1);
    if (cur > toMk) break;
  }
  return out;
}

async function readFinanceSettings(db) {
  const snap = await db.doc(SETTINGS_DOC.join('/')).get();
  const data = snap.exists ? snap.data() || {} : {};
  const regions = data.taxRegions && typeof data.taxRegions === 'object' ? data.taxRegions : {};
  return {
    taxRatePct: Number.isFinite(Number(data.taxRatePct)) ? Number(data.taxRatePct) : taxRatePct(),
    stockAllocationPct: Number.isFinite(Number(data.stockAllocationPct))
      ? Number(data.stockAllocationPct)
      : allocationPct(),
    allocationEnabled: data.allocationEnabled !== false,
    avgUnitRevenueCents: Number.isFinite(Number(data.avgUnitRevenueCents))
      ? Math.max(100, Math.round(Number(data.avgUnitRevenueCents)))
      : 4900,
    costCategories: Array.isArray(data.costCategories)
      ? data.costCategories.map(String)
      : [...DEFAULT_COST_CATEGORIES],
    taxRegions: {
      US: Number.isFinite(Number(regions.US)) ? Number(regions.US) : 20,
      EU: Number.isFinite(Number(regions.EU)) ? Number(regions.EU) : 25,
      CA: Number.isFinite(Number(regions.CA)) ? Number(regions.CA) : 20,
    },
  };
}

async function writeFinanceSettings(db, patch) {
  const current = await readFinanceSettings(db);
  const next = {
    taxRatePct:
      patch.taxRatePct != null
        ? Math.min(60, Math.max(0, Number(patch.taxRatePct)))
        : current.taxRatePct,
    stockAllocationPct:
      patch.stockAllocationPct != null
        ? Math.min(50, Math.max(0, Number(patch.stockAllocationPct)))
        : current.stockAllocationPct,
    allocationEnabled:
      patch.allocationEnabled != null
        ? Boolean(patch.allocationEnabled)
        : current.allocationEnabled,
    avgUnitRevenueCents:
      patch.avgUnitRevenueCents != null
        ? Math.max(100, Math.round(Number(patch.avgUnitRevenueCents)))
        : current.avgUnitRevenueCents,
    costCategories: Array.isArray(patch.costCategories)
      ? patch.costCategories
          .map((c) => String(c).slice(0, 40))
          .filter(Boolean)
          .slice(0, 30)
      : current.costCategories,
    taxRegions: {
      US:
        patch.taxRegions?.US != null
          ? Math.min(60, Math.max(0, Number(patch.taxRegions.US)))
          : current.taxRegions.US,
      EU:
        patch.taxRegions?.EU != null
          ? Math.min(60, Math.max(0, Number(patch.taxRegions.EU)))
          : current.taxRegions.EU,
      CA:
        patch.taxRegions?.CA != null
          ? Math.min(60, Math.max(0, Number(patch.taxRegions.CA)))
          : current.taxRegions.CA,
    },
    updatedAt: FieldValue.serverTimestamp(),
  };
  await db.doc(SETTINGS_DOC.join('/')).set(next, { merge: true });
  return readFinanceSettings(db);
}

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

async function listLedger(db, { sinceDays = 220 } = {}) {
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
  let snap;
  try {
    snap = await db
      .collection(COLLECTION)
      .where('createdAt', '>=', Timestamp.fromDate(since))
      .orderBy('createdAt', 'desc')
      .limit(3000)
      .get();
  } catch {
    snap = await db.collection(COLLECTION).limit(3000).get();
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

function filterRows(rows, { projectId, fromMonth, toMonth } = {}) {
  return rows.filter((row) => {
    if (projectId && projectId !== 'all' && row.projectId !== projectId) return false;
    const mk = row.monthKey || (row.createdAt ? String(row.createdAt).slice(0, 7) : monthKey());
    if (fromMonth && mk < fromMonth) return false;
    if (toMonth && mk > toMonth) return false;
    return true;
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
    if (!months[mk]) months[mk] = { revenueCents: 0, costCents: 0, taxCents: 0 };

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
  const marginPct =
    revenueCents > 0 ? Math.round((netProfitCents / revenueCents) * 1000) / 10 : null;

  const sortedMonths = Object.keys(months).sort();
  const trend = sortedMonths.slice(-6).map((mk) => {
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

  const currentMk = monthKey();
  const prevMk = shiftMonthKey(currentMk, -1);
  const cur = months[currentMk] || { revenueCents: 0, costCents: 0, taxCents: 0 };
  const prev = months[prevMk] || { revenueCents: 0, costCents: 0, taxCents: 0 };
  const curPre = cur.revenueCents - cur.costCents;
  const curTax = cur.taxCents > 0 ? cur.taxCents : curPre > 0 ? Math.round(curPre * taxRate) : 0;
  const prevPre = prev.revenueCents - prev.costCents;
  const prevTax =
    prev.taxCents > 0 ? prev.taxCents : prevPre > 0 ? Math.round(prevPre * taxRate) : 0;
  const monthly = {
    monthKey: currentMk,
    revenueCents: cur.revenueCents,
    costCents: cur.costCents,
    taxCents: curTax,
    netProfitCents: curPre - curTax,
  };
  const momGrowthPct =
    prev.revenueCents > 0
      ? Math.round(((cur.revenueCents - prev.revenueCents) / prev.revenueCents) * 1000) / 10
      : cur.revenueCents > 0
        ? 100
        : 0;

  const unit = settings.avgUnitRevenueCents || 4900;
  const breakEvenUnits = costCents > 0 ? Math.ceil(costCents / unit) : 0;

  return {
    projectId,
    name,
    revenueCents,
    costCents,
    taxCents: taxEstimatedCents,
    netProfitCents,
    profitMarginPct: marginPct,
    momGrowthPct,
    costsByCategory: byCategory,
    allocatedToStockCents: allocatedOutCents,
    allocatedFromProjectsCents: allocatedInCents,
    monthly,
    cumulative: {
      revenueCents,
      costCents,
      taxCents: taxEstimatedCents,
      netProfitCents,
    },
    breakEvenUnits,
    avgUnitRevenueCents: unit,
    trend,
  };
}

function linearForecast(series) {
  const points = (series || []).map((s, i) => ({
    x: i,
    y: Number(s.revenueCents) || 0,
  }));
  if (points.length < 2) {
    return { nextQuarterRevenueCents: 0, slope: 0 };
  }
  const n = points.length;
  const sumX = points.reduce((a, p) => a + p.x, 0);
  const sumY = points.reduce((a, p) => a + p.y, 0);
  const sumXY = points.reduce((a, p) => a + p.x * p.y, 0);
  const sumXX = points.reduce((a, p) => a + p.x * p.x, 0);
  const denom = n * sumXX - sumX * sumX;
  const slope = denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  let total = 0;
  for (let i = 0; i < 3; i += 1) {
    const x = n + i;
    total += Math.max(0, Math.round(intercept + slope * x));
  }
  return { nextQuarterRevenueCents: total, slope: Math.round(slope) };
}

function buildAllocationHistory(rows, limit = 50) {
  const outs = rows
    .filter((r) => r.type === 'cost' && r.category === 'stock_allocation_out')
    .map((r) => ({
      id: r.id,
      date: r.dayKey || (r.createdAt ? String(r.createdAt).slice(0, 10) : null),
      sourceProjectId: r.projectId,
      sourceProjectName: PROJECT_NAMES[r.projectId] || r.projectId,
      amountCents: Math.round(Number(r.amountCents) || 0),
      destinationProjectId: 'global-stock',
      destinationProjectName: PROJECT_NAMES['global-stock'],
      monthKey: r.monthKey || null,
    }))
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  return outs.slice(0, limit);
}

function buildCostDistribution(projects) {
  const map = {};
  for (const p of projects) {
    for (const [cat, amt] of Object.entries(p.costsByCategory || {})) {
      map[cat] = (map[cat] || 0) + Number(amt || 0);
    }
  }
  return Object.entries(map)
    .map(([category, amountCents]) => ({ category, amountCents }))
    .sort((a, b) => b.amountCents - a.amountCents);
}

function buildConsolidatedTrend(projects, monthsWanted = 6) {
  const keys = new Set();
  for (const p of projects) {
    for (const t of p.trend || []) keys.add(t.monthKey);
  }
  const sorted = [...keys].sort().slice(-monthsWanted);
  if (!sorted.length) {
    const cur = monthKey();
    for (let i = monthsWanted - 1; i >= 0; i -= 1) {
      sorted.push(shiftMonthKey(cur, -i));
    }
  }
  return sorted.map((mk) => {
    let revenueCents = 0;
    let costCents = 0;
    let taxCents = 0;
    let netProfitCents = 0;
    let allocatedCents = 0;
    for (const p of projects) {
      const row = (p.trend || []).find((t) => t.monthKey === mk);
      if (!row) continue;
      revenueCents += row.revenueCents;
      costCents += row.costCents;
      taxCents += row.taxCents;
      netProfitCents += row.netProfitCents;
    }
    return { monthKey: mk, revenueCents, costCents, taxCents, netProfitCents, allocatedCents };
  });
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

/**
 * Full overview for /admin/financials page.
 */
async function buildFinanceOverview(
  db,
  { revenueCents30d, projectId = 'all', fromMonth, toMonth } = {}
) {
  await ensureSeedFinancials(db);
  if (revenueCents30d != null) {
    await syncResumoraRevenueHint(db, revenueCents30d);
  }
  const settings = await readFinanceSettings(db);
  const allRows = await listLedger(db);
  const toMk = toMonth || monthKey();
  const fromMk = fromMonth || shiftMonthKey(toMk, -5);
  const filtered = filterRows(allRows, { projectId, fromMonth: fromMk, toMonth: toMk });
  const ids =
    projectId && projectId !== 'all'
      ? [projectId].filter((id) => PROJECT_IDS.includes(id))
      : PROJECT_IDS;
  const projects = ids.map((id) => summarizeProject(id, filtered, settings));

  const monthTotals = projects.reduce(
    (acc, p) => {
      acc.revenueCents += p.monthly.revenueCents;
      acc.costCents += p.monthly.costCents;
      acc.taxCents += p.monthly.taxCents;
      acc.netProfitCents += p.monthly.netProfitCents;
      return acc;
    },
    { revenueCents: 0, costCents: 0, taxCents: 0, netProfitCents: 0 }
  );

  const cumulative = projects.reduce(
    (acc, p) => {
      acc.revenueCents += p.cumulative.revenueCents;
      acc.costCents += p.cumulative.costCents;
      acc.taxCents += p.cumulative.taxCents;
      acc.netProfitCents += p.cumulative.netProfitCents;
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

  const trend6 = buildConsolidatedTrend(
    PROJECT_IDS.map((id) => summarizeProject(id, allRows, settings)),
    6
  );
  // fill allocation into trend from history
  const allocHist = buildAllocationHistory(allRows, 200);
  for (const t of trend6) {
    t.allocatedCents = allocHist
      .filter((a) => a.monthKey === t.monthKey)
      .reduce((s, a) => s + a.amountCents, 0);
  }

  const forecast = linearForecast(trend6);
  const costDistribution = buildCostDistribution(projects);
  const pnl = projects.map((p) => ({
    projectId: p.projectId,
    name: p.name,
    revenueCents: p.revenueCents,
    costCents: p.costCents,
    taxCents: p.taxCents,
    netProfitCents: p.netProfitCents,
    profitMarginPct: p.profitMarginPct,
  }));

  const taxByRegion = Object.fromEntries(
    Object.entries(settings.taxRegions).map(([region, rate]) => {
      const pretax = cumulative.revenueCents - cumulative.costCents;
      const liability = pretax > 0 ? Math.round(pretax * (rate / 100)) : 0;
      return [region, { ratePct: rate, estimatedTaxCents: liability }];
    })
  );

  return {
    generatedAt: new Date().toISOString(),
    currency: 'USD',
    filters: { projectId: projectId || 'all', fromMonth: fromMk, toMonth: toMk },
    settings,
    summary: {
      month: monthTotals,
      cumulative,
      allocatedToStockCents: cumulative.allocatedToStockCents,
    },
    projects,
    pnl,
    costDistribution,
    trends: {
      revenueProfit: trend6,
      allocation: trend6.map((t) => ({
        monthKey: t.monthKey,
        allocatedCents: t.allocatedCents,
      })),
    },
    allocationHistory: buildAllocationHistory(allRows, 40),
    analytics: {
      forecast,
      taxByRegion,
      breakEven: projects.map((p) => ({
        projectId: p.projectId,
        name: p.name,
        breakEvenUnits: p.breakEvenUnits,
        avgUnitRevenueCents: p.avgUnitRevenueCents,
        costCents: p.costCents,
      })),
      cashFlow: {
        actualNetCents: cumulative.netProfitCents,
        projectedNextQuarterRevenueCents: forecast.nextQuarterRevenueCents,
        note: 'Projection is linear on recent revenue months; not a cash-bank forecast.',
      },
    },
  };
}

function overviewToCsv(overview) {
  const lines = [
    'projectId,name,revenueCents,costCents,taxCents,netProfitCents,marginPct,momGrowthPct,allocatedToStockCents',
  ];
  for (const p of overview.projects || []) {
    lines.push(
      [
        p.projectId,
        JSON.stringify(p.name),
        p.revenueCents,
        p.costCents,
        p.taxCents,
        p.netProfitCents,
        p.profitMarginPct ?? '',
        p.momGrowthPct ?? '',
        p.allocatedToStockCents,
      ].join(',')
    );
  }
  lines.push('');
  lines.push('allocationDate,sourceProject,amountCents,destination');
  for (const a of overview.allocationHistory || []) {
    lines.push([a.date || '', a.sourceProjectId, a.amountCents, a.destinationProjectId].join(','));
  }
  return `${lines.join('\n')}\n`;
}

let fxCache = { at: 0, rates: { USD: 1, EUR: 0.92, GBP: 0.79, CAD: 1.36 } };

async function getFxRates() {
  const now = Date.now();
  if (now - fxCache.at < 60 * 60 * 1000) return fxCache.rates;
  try {
    const res = await fetch('https://api.frankfurter.app/latest?from=USD&to=EUR,GBP,CAD');
    if (res.ok) {
      const data = await res.json();
      fxCache = {
        at: now,
        rates: { USD: 1, EUR: data.rates.EUR, GBP: data.rates.GBP, CAD: data.rates.CAD },
      };
    }
  } catch {
    /* keep last */
  }
  return fxCache.rates;
}

module.exports = {
  COLLECTION,
  PROJECT_IDS,
  PROJECT_NAMES,
  DEFAULT_COST_CATEGORIES,
  taxRatePct,
  allocationPct,
  monthKey,
  dayKey,
  shiftMonthKey,
  monthKeysBetween,
  readFinanceSettings,
  writeFinanceSettings,
  ensureSeedFinancials,
  syncResumoraRevenueHint,
  listLedger,
  buildFinancialDashboard,
  buildFinanceOverview,
  overviewToCsv,
  getFxRates,
  summarizeProject,
};
