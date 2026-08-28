/**
 * Point existing Stripe Payment Link after_completion redirects at Firebase Studio.
 * Never prints secret values. No Render / onrender.com.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import Stripe from 'stripe';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
dotenv.config({ path: path.join(root, '.env.local'), quiet: true });
dotenv.config({ path: path.join(root, 'functions', '.env'), quiet: true });
dotenv.config({ path: 'D:/BossMind/config/secrets.env', quiet: true });

const secret = process.env.STRIPE_SECRET_KEY;
if (!secret) {
  console.error('Missing STRIPE_SECRET_KEY');
  process.exit(1);
}

const stripe = new Stripe(secret, { apiVersion: '2024-11-20.acacia' });
const SUCCESS = 'https://client-resumora-live.web.app/studio';
const CANCEL = 'https://resumora.net/pricing';

const LINK_URLS = [
  'https://buy.stripe.com/test_28E3cv5XL9BFf1j0Ja0Fi0c',
  'https://buy.stripe.com/test_28E7sLbi5aFJ6uNbnO0Fi01',
  'https://buy.stripe.com/test_cNiaEXeuh5lp8CVcrS0Fi08',
  'https://buy.stripe.com/test_3cIeVd99XaFJ4mFeA00Fi00',
];

function linkIdFromUrl(url) {
  const m = String(url).match(/buy\.stripe\.com\/(?:test_)?([A-Za-z0-9]+)/);
  return m ? (String(url).includes('/test_') ? `test_${m[1]}` : m[1]) : '';
}

const results = [];
for (const url of LINK_URLS) {
  const id = linkIdFromUrl(url);
  if (!id) {
    results.push(`${url}:bad-url`);
    continue;
  }
  try {
    // Payment Link IDs are plink_… — resolve via list filter on url is not supported;
    // retrieve by searching active links for matching url.
    const list = await stripe.paymentLinks.list({ limit: 100, active: true });
    const found = list.data.find((l) => l.url === url || l.url.endsWith(id.replace(/^test_/, '')));
    if (!found) {
      results.push(`${id}:not-found`);
      continue;
    }
    await stripe.paymentLinks.update(found.id, {
      after_completion: {
        type: 'redirect',
        redirect: { url: SUCCESS },
      },
    });
    results.push(`${found.id}:ok->studio`);
  } catch (err) {
    results.push(`${id}:err:${err.message || 'failed'}`);
  }
}

console.log(`SUCCESS_TARGET=${SUCCESS}`);
console.log(`CANCEL_HINT=${CANCEL}`);
console.log(`RESULTS=${results.join(',')}`);
