/**
 * Client-only dashboard aggregator (uid-scoped).
 * Never logs Stripe secret/price ids.
 */

function planDisplayFromId(planId) {
  const id = String(planId || '').toLowerCase();
  const map = {
    basic: 'Basic',
    balanced: 'Pro',
    pro: 'Pro',
    professional: 'Business',
    business: 'Business',
    advanced: 'Enterprise',
    enterprise: 'Enterprise',
  };
  return map[id] || null;
}

function planDisplayFromCents(cents) {
  const n = Number(cents) || 0;
  if (n === 2900) return { planId: 'basic', plan: 'Basic', planKey: 'basic' };
  if (n === 4900) return { planId: 'balanced', plan: 'Pro', planKey: 'pro' };
  if (n === 7900) return { planId: 'professional', plan: 'Business', planKey: 'business' };
  if (n === 11000) return { planId: 'advanced', plan: 'Enterprise', planKey: 'enterprise' };
  return { planId: null, plan: null, planKey: null };
}

function normalizeStoredPlanKey(raw) {
  const id = String(raw || '')
    .trim()
    .toLowerCase();
  if (!id) return null;
  if (id === 'balanced') return 'pro';
  if (id === 'professional') return 'business';
  if (id === 'advanced') return 'enterprise';
  if (id === 'basic' || id === 'pro' || id === 'business' || id === 'enterprise') return id;
  return id;
}

/**
 * @param {FirebaseFirestore.Firestore} db
 * @param {import('stripe').Stripe|null} stripe
 * @param {{ uid: string, email?: string }} opts
 * @param {typeof import('./refunds')} refunds
 */
async function buildClientDashboard(db, stripe, { uid, email }, refunds) {
  if (!uid) {
    const err = new Error('Unauthorized');
    err.statusCode = 401;
    throw err;
  }

  const userRef = db.collection('users').doc(String(uid));
  const userSnap = await userRef.get();
  const userData = userSnap.exists ? userSnap.data() || {} : {};
  const userEmail = String(email || userData.email || '')
    .trim()
    .toLowerCase();

  const paymentsOut = stripe
    ? await refunds.listMyPayments(db, stripe, { uid, email: userEmail })
    : { items: [], stripeCustomerId: userData.stripeCustomerId || null };

  const transactions = (paymentsOut.items || []).map((row) => ({
    id: row.id,
    amount: row.amount,
    currency: row.currency,
    status: row.status,
    created: row.created,
    plan: row.plan || planDisplayFromId(row.planId) || planDisplayFromCents(row.amount).plan,
    planId: row.planId || planDisplayFromCents(row.amount).planId,
    payment_intent: row.payment_intent || null,
    refundable: Boolean(row.refundable),
  }));

  const customerId =
    String(paymentsOut.stripeCustomerId || userData.stripeCustomerId || '').trim() || null;

  // Invoices / receipts for this customer only
  const invoices = [];
  if (stripe && customerId && customerId.startsWith('cus_')) {
    try {
      const inv = await stripe.invoices.list({ customer: customerId, limit: 30 });
      for (const i of inv.data || []) {
        invoices.push({
          id: i.id,
          number: i.number || null,
          status: i.status || null,
          amount: Number(i.amount_paid || i.total || 0),
          currency: i.currency || 'usd',
          created: i.created ? new Date(Number(i.created) * 1000).toISOString() : null,
          hosted_invoice_url: i.hosted_invoice_url || null,
          invoice_pdf: i.invoice_pdf || null,
        });
      }
    } catch (err) {
      console.warn(
        JSON.stringify({
          scope: 'clientDashboard',
          step: 'invoices',
          error: String(err && err.message ? err.message : err).slice(0, 120),
        })
      );
    }

    // Charge receipts as invoice-like rows when no Stripe Invoice objects (one-time Checkout)
    if (invoices.length === 0) {
      for (const tx of transactions) {
        invoices.push({
          id: `rcpt_${tx.id}`,
          number: null,
          status: tx.status === 'succeeded' || tx.status === 'paid' ? 'paid' : tx.status,
          amount: tx.amount,
          currency: tx.currency,
          created: tx.created,
          hosted_invoice_url: null,
          invoice_pdf: null,
          receipt_of: tx.id,
          plan: tx.plan,
        });
      }
    }
  } else if (transactions.length) {
    for (const tx of transactions) {
      invoices.push({
        id: `rcpt_${tx.id}`,
        number: null,
        status: tx.status === 'succeeded' || tx.status === 'paid' ? 'paid' : tx.status,
        amount: tx.amount,
        currency: tx.currency,
        created: tx.created,
        hosted_invoice_url: null,
        invoice_pdf: null,
        receipt_of: tx.id,
        plan: tx.plan,
      });
    }
  }

  // Documents: uploads (failed_parses + resume markers) + downloads for this uid only
  const documents = [];
  try {
    const dl = await db
      .collection('user_downloads')
      .where('user_id', '==', String(uid))
      .limit(40)
      .get();
    for (const doc of dl.docs) {
      const d = doc.data() || {};
      documents.push({
        id: doc.id,
        kind: 'download',
        title: d.video_id || d.title || 'download',
        language: d.language || null,
        createdAt: d.created_at || null,
      });
    }
  } catch (_) {
    /* index may be missing — ignore */
  }

  try {
    const ups = await db.collection('users').doc(String(uid)).collection('uploads').limit(40).get();
    for (const doc of ups.docs) {
      const d = doc.data() || {};
      documents.push({
        id: doc.id,
        kind: 'upload',
        title: d.fileName || d.name || 'upload',
        createdAt:
          d.createdAt && d.createdAt.toDate
            ? d.createdAt.toDate().toISOString()
            : d.createdAt || null,
      });
    }
  } catch (_) {
    /* optional subcollection */
  }

  if (userData.lastResumeFileName || userData.resumeFileName) {
    documents.unshift({
      id: 'profile_resume',
      kind: 'upload',
      title: userData.lastResumeFileName || userData.resumeFileName,
      createdAt: userData.resumeUpdatedAt || userData.updatedAt || null,
    });
  }

  documents.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

  const active =
    typeof refunds.isSubscriptionActive === 'function'
      ? refunds.isSubscriptionActive(userData)
      : String(userData.subscriptionStatus || '').toLowerCase() === 'active';

  // Prefer Firestore plan fields written by webhook. If lastAmountTotal conflicts
  // (legacy wrong metadata → "pro" on a $29 charge), trust the paid amount.
  const fromAmount = planDisplayFromCents(userData.lastAmountTotal);
  const storedKey = normalizeStoredPlanKey(userData.plan || userData.planId);
  const amountKey = fromAmount.planKey;
  const mismatch = Boolean(amountKey) && Boolean(storedKey) && amountKey !== storedKey;

  const planKey = mismatch ? amountKey : storedKey || amountKey || null;
  // Never invent a default like "pro" when plan is missing.
  const plan = {
    id: planKey,
    name: planDisplayFromId(planKey) || null,
    status: active
      ? 'active'
      : String(userData.subscriptionStatus || userData.planStatus || 'inactive'),
    subscriptionStatus: userData.subscriptionStatus || null,
    planStatus: userData.planStatus || null,
    purchaseDate: userData.purchaseDate || null,
    paid: userData.paid === true,
    amountCorrected: mismatch,
  };

  console.log(
    JSON.stringify({
      scope: 'clientDashboard',
      uid,
      email: userEmail || null,
      hasCustomer: Boolean(customerId),
      transactions: transactions.length,
      invoices: invoices.length,
      documents: documents.length,
      planActive: active,
      plan: planKey,
      amount_total: Number(userData.lastAmountTotal) || null,
      amountCorrected: mismatch,
    })
  );

  return {
    user: {
      uid,
      email: userEmail || null,
    },
    plan,
    transactions,
    invoices,
    documents,
    linkedCustomer: Boolean(customerId),
  };
}

module.exports = {
  buildClientDashboard,
};
