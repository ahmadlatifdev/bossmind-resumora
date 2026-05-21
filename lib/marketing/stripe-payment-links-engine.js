/**
 * Provision isolated Stripe products + payment links (one link per service/plan).
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { createStripeServerClient } = require("./stripe-server");
const { paymentLinkAfterCompletion } = require("./stripe-checkout-urls");
const { loadBrandAuthority, normalizeBrandText } = require("./bossmind-brand-authority");
const hub = require("../shared/bossmind-hub-memory");
const neon = require("../shared/neon-memory");

function loadCatalog(cwd = process.cwd()) {
  const p = path.join(cwd, "config/bossmind-stripe-payment-links-catalog.json");
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function logoUrl(cwd, catalog) {
  const origin = String(
    process.env.BOSSMIND_IMMUTABLE_PROBE_ORIGIN ||
      process.env.BOSSMIND_STRIPE_PROBE_ORIGIN ||
      "https://resumora.net"
  ).replace(/\/$/, "");
  return `${origin}${catalog.logoPublicPath || "/brand/resumora-logo-official-transparent.png"}`;
}

function serviceMetadata(service, catalog) {
  return {
    brand_name: catalog.officialBrand,
    service_key: service.serviceKey,
    plan_ids: (service.planIds || []).join(","),
    category: service.category || "tier",
    checkout_mode: catalog.checkoutMode || "payment",
    bossmind_isolated_link: "1",
  };
}

async function findProductByServiceKey(stripe, serviceKey) {
  const products = [];
  let starting_after;
  do {
    const page = await stripe.products.list({ limit: 100, active: true, starting_after });
    products.push(...(page.data || []));
    starting_after = page.has_more ? page.data[page.data.length - 1]?.id : undefined;
  } while (starting_after);
  return products.find((p) => p.metadata?.service_key === serviceKey) || null;
}

async function findPaymentLinkForService(stripe, serviceKey) {
  const links = [];
  let starting_after;
  do {
    const page = await stripe.paymentLinks.list({ limit: 100, active: true, starting_after });
    links.push(...(page.data || []));
    starting_after = page.has_more ? page.data[page.data.length - 1]?.id : undefined;
  } while (starting_after);
  return (
    links.find((l) => l.metadata?.service_key === serviceKey && l.active) ||
    links.find((l) => l.metadata?.service_key === serviceKey) ||
    null
  );
}

async function ensureProduct(stripe, service, catalog, logo, { dryRun, force } = {}) {
  const name = normalizeBrandText(service.name, loadBrandAuthority());
  const description = normalizeBrandText(service.description || "", loadBrandAuthority());
  let product = await findProductByServiceKey(stripe, service.serviceKey);

  if (!product && !dryRun) {
    product = await stripe.products.create({
      name,
      description,
      active: true,
      images: [logo],
      metadata: serviceMetadata(service, catalog),
    });
  } else if (product && !dryRun && (force || product.name !== name)) {
    product = await stripe.products.update(product.id, {
      name,
      description,
      active: true,
      images: [logo],
      metadata: { ...product.metadata, ...serviceMetadata(service, catalog) },
    });
  }

  return { product, name, description };
}

async function ensureOneTimePrice(stripe, productId, service, catalog, { dryRun } = {}) {
  const amountCents = Math.round(Number(service.amountUsd) * 100);
  if (!productId) return { priceId: null, amountCents };

  const prices = await stripe.prices.list({ product: productId, active: true, limit: 20 });
  let price = (prices.data || []).find(
    (p) => p.type === "one_time" && p.unit_amount === amountCents && p.currency === catalog.currency
  );

  if (!price && !dryRun) {
    price = await stripe.prices.create({
      product: productId,
      unit_amount: amountCents,
      currency: catalog.currency || "usd",
      metadata: {
        service_key: service.serviceKey,
        brand_name: catalog.officialBrand,
      },
    });
  }

  return { priceId: price?.id || null, amountCents, price };
}

async function ensurePaymentLink(stripe, priceId, service, catalog, { dryRun, force } = {}) {
  const existing = await findPaymentLinkForService(stripe, service.serviceKey);
  const meta = serviceMetadata(service, catalog);

  const afterCompletion = paymentLinkAfterCompletion();

  if (existing && !force) {
    if (!dryRun) {
      const updated = await stripe.paymentLinks.update(existing.id, {
        after_completion: afterCompletion,
      });
      return { paymentLink: updated, created: false, redirectSynced: true };
    }
    return { paymentLink: existing, created: false };
  }

  if (dryRun) {
    return { paymentLink: existing || { url: "(dry-run)", id: null }, created: !existing };
  }

  if (existing && force) {
    await stripe.paymentLinks.update(existing.id, { active: false });
  }

  const paymentLink = await stripe.paymentLinks.create({
    line_items: [{ price: priceId, quantity: 1 }],
    metadata: meta,
    after_completion: afterCompletion,
    custom_text: {
      submit: { message: "Secure one-time payment · Resumora executive studio" },
    },
    phone_number_collection: { enabled: false },
    billing_address_collection: "auto",
    allow_promotion_codes: true,
  });

  return { paymentLink, created: true };
}

async function provisionService(stripe, service, catalog, logo, opts) {
  const { product, name } = await ensureProduct(stripe, service, catalog, logo, opts);
  const productId = product?.id || null;
  const { priceId, amountCents } = await ensureOneTimePrice(stripe, productId, service, catalog, opts);
  const { paymentLink, created } = await ensurePaymentLink(stripe, priceId, service, catalog, opts);

  return {
    serviceKey: service.serviceKey,
    name,
    amountUsd: service.amountUsd,
    amountCents,
    planIds: service.planIds,
    productId,
    priceId,
    paymentLinkId: paymentLink?.id || null,
    paymentLinkUrl: paymentLink?.url || null,
    linkCreated: created,
    active: paymentLink?.active !== false,
  };
}

function buildPlanRouteMap(entries) {
  const map = {};
  for (const e of entries) {
    for (const planId of e.planIds || []) {
      if (map[planId] && map[planId] !== e.serviceKey) {
        throw new Error(`Duplicate planId routing: ${planId}`);
      }
      map[planId] = {
        serviceKey: e.serviceKey,
        paymentLinkUrl: e.paymentLinkUrl,
        paymentLinkId: e.paymentLinkId,
      };
    }
  }
  return map;
}

function writeBackups(cwd, manifest) {
  const dir = path.join(cwd, "windows-heal", "stripe-payment-links");
  fs.mkdirSync(dir, { recursive: true });
  const stamp = manifest.generatedAt.replace(/[:.]/g, "-");

  const jsonPath = path.join(dir, `payment-links-${stamp}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(manifest, null, 2), "utf8");

  const txtLines = [
    "Resumora Stripe Payment Links — Secure Backup",
    `Generated: ${manifest.generatedAt}`,
    `Official brand: ${manifest.officialBrand}`,
    "",
    ...manifest.services.map(
      (s) =>
        `${s.name}\n  service_key: ${s.serviceKey}\n  plan_ids: ${(s.planIds || []).join(", ")}\n  url: ${s.paymentLinkUrl}\n  product: ${s.productId}\n  price: ${s.priceId}\n  link_id: ${s.paymentLinkId}\n`
    ),
  ];
  const txtPath = path.join(dir, "resumora-payment-links-secure-backup.txt");
  fs.writeFileSync(txtPath, txtLines.join("\n"), "utf8");

  const gdocLines = [
    "RESUMORA STRIPE PAYMENT LINKS — GOOGLE DOCS PASTE EXPORT",
    `Last sync: ${manifest.generatedAt}`,
    "",
    "| Service | Plan IDs | Amount USD | Payment link |",
    "|---|---|---:|---|",
    ...manifest.services.map(
      (s) => `| ${s.name} | ${(s.planIds || []).join(", ")} | ${s.amountUsd} | ${s.paymentLinkUrl} |`
    ),
  ];
  const gdocPath = path.join(dir, "resumora-payment-links-google-docs-export.txt");
  fs.writeFileSync(gdocPath, gdocLines.join("\n"), "utf8");

  const bossmindDir = path.join(cwd, ".bossmind", "stripe-payment-links");
  fs.mkdirSync(bossmindDir, { recursive: true });
  fs.writeFileSync(path.join(bossmindDir, "latest.json"), JSON.stringify(manifest, null, 2), "utf8");

  return { jsonPath, txtPath, gdocPath, bossmindDir };
}

async function persistToNeon(projectKey, manifest) {
  await hub.ensureBossmindHubMemoryInitialized();
  await neon.ensureSharedMemoryInitialized();

  const rows = [];
  for (const s of manifest.services) {
    const row = await hub.upsertPaymentLink({
      projectKey,
      serviceKey: s.serviceKey,
      productId: s.productId,
      priceId: s.priceId,
      paymentLinkId: s.paymentLinkId,
      paymentLinkUrl: s.paymentLinkUrl,
      amountCents: s.amountCents,
      currency: manifest.currency || "usd",
      metadata: {
        name: s.name,
        planIds: s.planIds,
        category: s.category,
      },
      locked: true,
    });
    rows.push(row);
  }

  await hub.upsertBossmindMemory({
    projectKey,
    memoryKey: "stripe_payment_links:production",
    memoryType: "stripe_payment_links",
    payload: manifest,
    writerAgent: "bossmind_orchestrator",
    locked: true,
  });

  if (neon.saveEvent) {
    await neon.saveEvent({
      projectKey,
      eventType: "stripe_payment_links_provisioned",
      severity: "info",
      source: "stripe_payment_links_engine",
      eventKey: manifest.manifestHash,
      payload: { count: manifest.services.length },
    });
  }

  return { rows: rows.filter(Boolean).length };
}

async function runPaymentLinksProvision({
  cwd = process.cwd(),
  projectKey = "resumora",
  dryRun = true,
  force = false,
  persist = true,
} = {}) {
  const catalog = loadCatalog(cwd);
  const { stripe, reason } = createStripeServerClient();
  if (!stripe) {
    return { ok: false, error: "stripe_unconfigured", reason, services: [] };
  }

  const logo = logoUrl(cwd, catalog);
  const entries = [];

  for (const service of catalog.services) {
    const row = await provisionService(stripe, service, catalog, logo, { dryRun, force });
    entries.push({ ...service, ...row, category: service.category });
  }

  const planRoutes = buildPlanRouteMap(entries);
  const manifest = {
    generatedAt: new Date().toISOString(),
    officialBrand: catalog.officialBrand,
    currency: catalog.currency,
    checkoutMode: catalog.checkoutMode,
    logoUrl: logo,
    dryRun,
    services: entries,
    planRoutes,
  };
  manifest.manifestHash = crypto
    .createHash("sha256")
    .update(JSON.stringify(entries.map((e) => [e.serviceKey, e.paymentLinkUrl, e.priceId])))
    .digest("hex");

  const backups = writeBackups(cwd, manifest);
  manifest.backups = {
    txt: backups.txtPath.replace(/\\/g, "/"),
    googleDocsExport: backups.gdocPath.replace(/\\/g, "/"),
    json: backups.jsonPath.replace(/\\/g, "/"),
    bossmind: path.join(backups.bossmindDir, "latest.json").replace(/\\/g, "/"),
  };

  const lockPath = path.join(cwd, catalog.lock?.manifestPath || "config/resumora-stripe-payment-links-lock.json");
  if (!dryRun) {
    fs.writeFileSync(lockPath, JSON.stringify(manifest, null, 2), "utf8");
    const protectedPath = path.join(
      cwd,
      catalog.lock?.protectedRegistry || "config/bossmind-protected-stripe-payment-links.json"
    );
    fs.writeFileSync(
      protectedPath,
      JSON.stringify(
        {
          lockedAt: manifest.generatedAt,
          manifestHash: manifest.manifestHash,
          services: entries.map((e) => ({
            serviceKey: e.serviceKey,
            paymentLinkId: e.paymentLinkId,
            paymentLinkUrl: e.paymentLinkUrl,
            productId: e.productId,
            priceId: e.priceId,
          })),
        },
        null,
        2
      ),
      "utf8"
    );
  }

  let neonPersist = { persisted: false };
  if (persist && !dryRun) {
    neonPersist = await persistToNeon(projectKey, manifest);
    neonPersist.persisted = true;
  }

  const ok = entries.every((e) => e.paymentLinkUrl && e.productId && e.priceId);
  return { ok, manifest, neonPersist, lockPath: lockPath.replace(/\\/g, "/") };
}

async function verifyPaymentLinks({ cwd = process.cwd() } = {}) {
  const lockPath = path.join(cwd, "config/resumora-stripe-payment-links-lock.json");
  if (!fs.existsSync(lockPath)) {
    return { ok: false, error: "lock_manifest_missing" };
  }
  const manifest = JSON.parse(fs.readFileSync(lockPath, "utf8"));
  const { stripe } = createStripeServerClient();
  if (!stripe) return { ok: false, error: "stripe_unconfigured" };

  const probes = [];
  for (const s of manifest.services || []) {
    let linkOk = false;
    let pageStatus = null;
    try {
      const link = s.paymentLinkId ? await stripe.paymentLinks.retrieve(s.paymentLinkId) : null;
      linkOk = Boolean(link?.active && link?.url);
      if (s.paymentLinkUrl) {
        const res = await fetch(s.paymentLinkUrl, { method: "GET", redirect: "follow" });
        pageStatus = res.status;
      }
    } catch (e) {
      linkOk = false;
    }
    probes.push({
      serviceKey: s.serviceKey,
      name: s.name,
      paymentLinkUrl: s.paymentLinkUrl,
      linkOk,
      pageStatus,
      publicAccessible: pageStatus >= 200 && pageStatus < 400,
    });
  }

  const ok = probes.every((p) => p.linkOk && p.publicAccessible);
  return { ok, probes, manifestHash: manifest.manifestHash };
}

module.exports = {
  loadCatalog,
  runPaymentLinksProvision,
  verifyPaymentLinks,
  buildPlanRouteMap,
};
