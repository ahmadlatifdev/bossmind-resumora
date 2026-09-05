/**
 * Allocate 10% of positive net profit from operating projects → global-stock.
 * Idempotent per calendar day via create() on allocation-lock-{YYYY-MM-DD}.
 */
const { FieldValue } = require('firebase-admin/firestore');
const {
  COLLECTION,
  PROJECT_IDS,
  monthKey,
  dayKey,
  readFinanceSettings,
  listLedger,
  summarizeProject,
} = require('./financeLedger');

const SOURCE_PROJECTS = PROJECT_IDS.filter((id) => id !== 'global-stock');

/**
 * @returns {Promise<{ day: string, transfers: object[], skipped: boolean, reason?: string }>}
 */
async function runDailyStockAllocation(db) {
  const settings = await readFinanceSettings(db);
  const day = dayKey();
  const lockRef = db.collection(COLLECTION).doc(`allocation-lock-${day}`);

  const existing = await lockRef.get();
  if (existing.exists) {
    return {
      day,
      transfers: existing.data()?.transfers || [],
      skipped: true,
      reason: existing.data()?.reason || 'already_ran_today',
    };
  }

  if (!settings.allocationEnabled) {
    try {
      await lockRef.create({
        type: 'allocation_lock',
        dayKey: day,
        skipped: true,
        reason: 'disabled',
        transfers: [],
        createdAt: FieldValue.serverTimestamp(),
      });
    } catch (err) {
      if (err && err.code === 6) {
        return { day, transfers: [], skipped: true, reason: 'already_ran_today' };
      }
      throw err;
    }
    return { day, transfers: [], skipped: true, reason: 'disabled' };
  }

  const rows = await listLedger(db, { sinceDays: 40 });
  const mk = monthKey();
  const pct = settings.stockAllocationPct / 100;
  const transfers = [];

  for (const projectId of SOURCE_PROJECTS) {
    const summary = summarizeProject(projectId, rows, settings);
    const net = Number(summary.netProfitCents) || 0;
    if (net <= 0) continue;
    const amount = Math.round(net * pct);
    if (amount <= 0) continue;
    transfers.push({ from: projectId, to: 'global-stock', amountCents: amount });
  }

  try {
    await lockRef.create({
      type: 'allocation_lock',
      dayKey: day,
      skipped: false,
      transfers,
      taxRatePct: settings.taxRatePct,
      stockAllocationPct: settings.stockAllocationPct,
      pendingWrite: true,
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    if (err && err.code === 6) {
      const snap = await lockRef.get();
      return {
        day,
        transfers: snap.data()?.transfers || [],
        skipped: true,
        reason: 'already_ran_today',
      };
    }
    throw err;
  }

  const writeBatch = db.batch();
  for (const t of transfers) {
    const outId = `alloc-out-${t.from}-${day}`;
    const inId = `alloc-in-${t.from}-${day}`;
    writeBatch.set(
      db.collection(COLLECTION).doc(outId),
      {
        projectId: t.from,
        type: 'cost',
        category: 'stock_allocation_out',
        amountCents: t.amountCents,
        currency: 'USD',
        monthKey: mk,
        dayKey: day,
        description: `Auto-allocation ${settings.stockAllocationPct}% net → Global Stock Trade`,
        source: 'stock_allocation',
        counterpartProjectId: 'global-stock',
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    writeBatch.set(
      db.collection(COLLECTION).doc(inId),
      {
        projectId: 'global-stock',
        type: 'revenue',
        category: 'stock_allocation_in',
        amountCents: t.amountCents,
        currency: 'USD',
        monthKey: mk,
        dayKey: day,
        description: `Capital in from ${t.from} (${settings.stockAllocationPct}% net)`,
        source: 'stock_allocation',
        counterpartProjectId: t.from,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }
  writeBatch.set(
    lockRef,
    {
      pendingWrite: false,
      transfers,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  await writeBatch.commit();

  return { day, transfers, skipped: false };
}

module.exports = { runDailyStockAllocation, SOURCE_PROJECTS };
