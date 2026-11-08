#!/usr/bin/env node
/**
 * Resumora auto-poster — real API integrations.
 *
 * Reads credentials from a `.env` file at the repo root (gitignored).
 *   cp marketing-automation/.env.example .env   # then fill in the values
 *
 * Channels:
 *   Twitter/X  -> twitter-api-v2 (OAuth 1.0a)
 *   LinkedIn   -> UGC Posts API (fetch)
 *   Facebook   -> Graph API page feed (fetch)
 *
 * Every post function returns the platform's post id (or null if not configured).
 */
import { loadEnvFile } from 'node:process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

try {
  loadEnvFile(path.join(REPO_ROOT, '.env'));
} catch {
  // no .env yet — functions return null until credentials are set
}

function env(name) {
  return String(process.env[name] || '').trim();
}

// --- Twitter / X ---------------------------------------------------------

async function postTwitter(text) {
  const appKey = env('TWITTER_API_KEY');
  const appSecret = env('TWITTER_API_SECRET');
  const accessToken = env('TWITTER_ACCESS_TOKEN');
  const accessSecret = env('TWITTER_ACCESS_SECRET');
  if (!appKey || !appSecret || !accessToken || !accessSecret) return null;

  const { TwitterApi } = await import('twitter-api-v2');
  const client = new TwitterApi({ appKey, appSecret, accessToken, accessSecret });
  const { data } = await client.v2.tweet(text);
  return data.id;
}

// --- LinkedIn (UGC Posts API) -------------------------------------------

async function postLinkedIn(text) {
  const token = env('LINKEDIN_ACCESS_TOKEN');
  const orgId = env('LINKEDIN_ORG_ID');
  if (!token || !orgId) return null;

  const res = await fetch('https://api.linkedin.com/v2/ugcPosts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify({
      author: `urn:li:organization:${orgId}`,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text },
          shareMediaCategory: 'NONE',
        },
      },
      visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`LinkedIn ${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
  return data.id || null;
}

// --- Facebook (Graph API page feed) -------------------------------------

async function postFacebook(text) {
  const token = env('FACEBOOK_PAGE_ACCESS_TOKEN');
  const pageId = env('FACEBOOK_PAGE_ID');
  if (!token || !pageId) return null;

  const url = `https://graph.facebook.com/v19.0/${pageId}/feed`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: text, access_token: token }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Facebook ${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
  return data.id || null;
}

export { postTwitter, postLinkedIn, postFacebook };
