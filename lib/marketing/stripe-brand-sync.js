/**
 * Sync Stripe product / price / payment-link branding to Resumora authority.
 */
const {
  loadBrandAuthority,
  findBrandViolations,
  normalizeBrandText,
  resolveOfficialProductName,
  officialPlanStripeName,
} = require("./bossmind-brand-authority");
const { createStripeServerClient } = require("./stripe-server");
const { resolveStripePriceId, ALLOWED_PLAN_IDS } = require("./stripe-plan-map");

async function listAllStripeProducts(stripe) {
  const products = [];
  let starting_after;
  do {
    const page = await stripe.products.list({ limit: 100, active: true, starting_after });
    products.push(...(page.data || []));
    starting_after = page.has_more ? page.data[page.data.length - 1]?.id : undefined;
  } while (starting_after);
  return products;
}

async function listAllPaymentLinks(stripe) {
  const links = [];
  let starting_after;
  do {
    const page = await stripe.paymentLinks.list({ limit: 100, active: true, starting_after });
    links.push(...(page.data || []));
    starting_after = page.has_more ? page.data[page.data.length - 1]?.id : undefined;
  } while (starting_after);
  return links;
}

function resolveOfficialNameForStripeProduct(product, config) {
  const name = product.name || "";
  const lower = name.toLowerCase();
  if (/\bbasic\b/.test(lower) || /essential career foundation/.test(lower)) {
    return officialPlanStripeName("basic", config);
  }
  if (/\belite\b/.test(lower) || /executive career package/.test(lower)) {
    return officialPlanStripeName("elite", config);
  }
  if (/essential advanced|advanced career upgrade/.test(lower)) {
    return officialPlanStripeName("essential_advanced", config);
  }
  if (/\bprofessional\b/.test(lower) || /professional career optimization/.test(lower)) {
    return officialPlanStripeName("professional", config);
  }
  for (const entry of config.catalogProducts || []) {
    if ((entry.match || []).some((m) => lower.includes(String(m).toLowerCase()))) {
      return entry.name;
    }
  }
  return resolveOfficialProductName(name, config);
}

function analyzeProduct(product, config) {
  const name = product.name || "";
  const description = product.description || "";
  const violations = [
    ...findBrandViolations(name, config),
    ...findBrandViolations(description, config),
  ];
  const officialName = resolveOfficialNameForStripeProduct(product, config);
  const officialDescription = normalizeBrandText(description, config);
  const needsUpdate =
    violations.length > 0 || name !== officialName || !/^Resumora:/i.test(name);
  return {
    id: product.id,
    currentName: name,
    currentDescription: description,
    officialName,
    officialDescription,
    violations,
    needsUpdate,
  };
}

async function buildCatalogReport({ cwd = process.cwd(), env = process.env } = {}) {
  const config = loadBrandAuthority(cwd);
  const { stripe, reason } = createStripeServerClient(env);
  if (!stripe) {
    return { ok: false, error: "stripe_unconfigured", reason, products: [], paymentLinks: [] };
  }

  const products = await listAllStripeProducts(stripe);
  const paymentLinks = await listAllPaymentLinks(stripe);
  const analyzed = products.map((p) => analyzeProduct(p, config));

  const planBindings = [];
  for (const planId of ALLOWED_PLAN_IDS) {
    const priceId = resolveStripePriceId(planId, env);
    if (!priceId) {
      planBindings.push({ planId, priceId: null, error: "missing_price_env" });
      continue;
    }
    try {
      const price = await stripe.prices.retrieve(priceId, { expand: ["product"] });
      const product = typeof price.product === "object" ? price.product : await stripe.products.retrieve(price.product);
      const analysis = analyzeProduct(product, config);
      planBindings.push({
        planId,
        priceId,
        officialName: officialPlanStripeName(planId, config),
        productId: product.id,
        analysis,
      });
    } catch (e) {
      planBindings.push({ planId, priceId, error: e.message });
    }
  }

  const linkIssues = [];
  for (const link of paymentLinks) {
    const meta = link.metadata || {};
    const violations = findBrandViolations(JSON.stringify(meta), config);
    if (violations.length) {
      linkIssues.push({ id: link.id, url: link.url, violations, metadata: meta });
    }
  }

  return {
    ok: true,
    officialBrand: config.officialBrand,
    products: analyzed,
    needsUpdate: analyzed.filter((p) => p.needsUpdate),
    planBindings,
    paymentLinks: paymentLinks.map((l) => ({ id: l.id, url: l.url, active: l.active })),
    paymentLinkIssues: linkIssues,
    counts: {
      products: analyzed.length,
      needsUpdate: analyzed.filter((p) => p.needsUpdate).length,
      paymentLinks: paymentLinks.length,
    },
  };
}

async function applyStripeBrandSync({ cwd = process.cwd(), env = process.env, dryRun = true } = {}) {
  const config = loadBrandAuthority(cwd);
  const report = await buildCatalogReport({ cwd, env });
  if (!report.ok) return { ...report, applied: [], dryRun };

  const { stripe } = createStripeServerClient(env);
  const applied = [];

  for (const item of report.needsUpdate) {
    const payload = {
      name: item.officialName,
      description: item.officialDescription || undefined,
      metadata: {
        brand_name: config.officialBrand,
        official_product_name: item.officialName,
        bossmind_brand_sync: new Date().toISOString(),
      },
    };
    if (!dryRun) {
      await stripe.products.update(item.id, payload);
    }
    applied.push({ productId: item.id, ...payload, dryRun });
  }

  for (const binding of report.planBindings) {
    if (!binding.productId || binding.error) continue;
    const officialName = binding.officialName;
    const current = binding.analysis?.currentName;
    if (current === officialName && binding.analysis?.violations?.length === 0) continue;
    const payload = {
      name: officialName,
      metadata: {
        brand_name: config.officialBrand,
        plan_id: binding.planId,
        official_product_name: officialName,
      },
    };
    if (!dryRun) {
      await stripe.products.update(binding.productId, payload);
    }
    applied.push({ productId: binding.productId, planId: binding.planId, ...payload, dryRun });
  }

  for (const issue of report.paymentLinkIssues || []) {
    const meta = { ...(issue.metadata || {}), brand_name: config.officialBrand };
    for (const [k, v] of Object.entries(meta)) {
      meta[k] = normalizeBrandText(String(v), config);
    }
    if (!dryRun) {
      await stripe.paymentLinks.update(issue.id, { metadata: meta });
    }
    applied.push({ paymentLinkId: issue.id, metadata: meta, dryRun });
  }

  const post = dryRun ? report : await buildCatalogReport({ cwd, env });

  return {
    ok: (post.needsUpdate || []).length === 0 && (post.paymentLinkIssues || []).length === 0,
    dryRun,
    applied,
    before: report.counts,
    after: post.counts,
    catalog: post,
  };
}

module.exports = {
  buildCatalogReport,
  applyStripeBrandSync,
  analyzeProduct,
};
