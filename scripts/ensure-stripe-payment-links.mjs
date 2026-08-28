/**
 * Ensure Resumora plan Prices + Payment Links exist on the active Stripe account
 * (matches STRIPE_SECRET_KEY mode). Writes env keys; never prints secret values.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import Stripe from "stripe";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
dotenv.config({ path: path.join(root, ".env.local"), quiet: true });
dotenv.config({ path: path.join(root, "functions", ".env"), quiet: true });

const secret = process.env.STRIPE_SECRET_KEY;
if (!secret) {
  console.error("Missing STRIPE_SECRET_KEY");
  process.exit(1);
}

const stripe = new Stripe(secret, { apiVersion: "2024-11-20.acacia" });
const mode = secret.startsWith("sk_live") ? "live" : "test";

const PLANS = [
  {
    id: "starter",
    name: "Resumora Starter",
    unitAmount: 8900,
    priceEnv: "NEXT_PUBLIC_STRIPE_PRICE_BASIC",
    linkEnv: "VITE_STRIPE_PAYMENT_LINK_STARTER",
  },
  {
    id: "professional",
    name: "Resumora Professional",
    unitAmount: 11000,
    priceEnv: "NEXT_PUBLIC_STRIPE_PRICE_PRO",
    linkEnv: "VITE_STRIPE_PAYMENT_LINK_PROFESSIONAL",
  },
  {
    id: "enterprise",
    name: "Resumora Enterprise",
    unitAmount: 19900,
    priceEnv: "NEXT_PUBLIC_STRIPE_PRICE_ELITE",
    linkEnv: "VITE_STRIPE_PAYMENT_LINK_ENTERPRISE",
  },
];

function upsertEnv(filePath, key, value) {
  let text = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, "m");
  text = re.test(text) ? text.replace(re, line) : `${text.trimEnd()}\n${line}\n`;
  fs.writeFileSync(filePath, text, "utf8");
}

async function priceExists(priceId) {
  if (!priceId || !priceId.startsWith("price_")) return false;
  try {
    await stripe.prices.retrieve(priceId);
    return true;
  } catch {
    return false;
  }
}

const envPath = path.join(root, ".env.local");
const status = [];

for (const plan of PLANS) {
  let priceId = process.env[plan.priceEnv] || "";
  if (!(await priceExists(priceId))) {
    const product = await stripe.products.create({
      name: plan.name,
      metadata: { planId: plan.id, source: "resumora.net" },
    });
    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: plan.unitAmount,
      currency: "usd",
      metadata: { planId: plan.id },
    });
    priceId = price.id;
    upsertEnv(envPath, plan.priceEnv, priceId);
    upsertEnv(envPath, `STRIPE_RESUMORA_${plan.id.toUpperCase()}_PRICE_ID`, priceId);
    process.env[plan.priceEnv] = priceId;
    status.push(`${plan.id}:price-created`);
  } else {
    status.push(`${plan.id}:price-ok`);
  }

  let linkUrl = process.env[plan.linkEnv] || "";
  if (!linkUrl.startsWith("https://")) {
    const link = await stripe.paymentLinks.create({
      line_items: [{ price: priceId, quantity: 1 }],
      after_completion: {
        type: "redirect",
        redirect: { url: "https://client-resumora-live.web.app/studio" },
      },
      metadata: { planId: plan.id, source: "resumora.net" },
    });
    linkUrl = link.url;
    upsertEnv(envPath, plan.linkEnv, linkUrl);
    process.env[plan.linkEnv] = linkUrl;
    status.push(`${plan.id}:link-created`);
  } else {
    status.push(`${plan.id}:link-ok`);
  }
}

console.log(`STRIPE_MODE=${mode}`);
console.log(`PAYMENT_LINKS_STATUS=${status.join(",")}`);
