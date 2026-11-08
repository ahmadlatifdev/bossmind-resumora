/**
 * weeklySocialBlast — scheduled (cron) social posting.
 *
 * Fires every Monday 09:00 America/New_York. Posts the Resumora value prop to
 * Twitter/X, LinkedIn, and Facebook. Reads credentials from process.env
 * (set via Firebase Secret Manager / Cloud Run env at deploy time).
 *
 * Failure handling: a channel failure logs structured context (feeds GCP Cloud
 * Logging / Error Reporting) and continues to the next channel — never throws.
 */
'use strict';

const { onSchedule } = require('firebase-functions/v2/scheduler');

const BRAND_URL = 'https://resumora.net';

function env(name) {
  return String(process.env[name] || '').trim();
}

function log(channel, ok, detail) {
  const line = JSON.stringify({ scope: 'weeklySocialBlast', channel, ok, detail });
  if (ok) console.info(line);
  else console.error(line);
}

async function postTwitter(text) {
  const appKey = env('TWITTER_API_KEY');
  const appSecret = env('TWITTER_API_SECRET');
  const accessToken = env('TWITTER_ACCESS_TOKEN');
  const accessSecret = env('TWITTER_ACCESS_SECRET');
  if (!appKey || !appSecret || !accessToken || !accessSecret) {
    log('twitter', false, 'missing credentials');
    return null;
  }
  const { TwitterApi } = require('twitter-api-v2');
  const client = new TwitterApi({ appKey, appSecret, accessToken, accessSecret });
  const { data } = await client.v2.tweet(text);
  return data.id;
}

async function postLinkedIn(text) {
  const token = env('LINKEDIN_ACCESS_TOKEN');
  const orgId = env('LINKEDIN_ORG_ID');
  if (!token || !orgId) {
    log('linkedin', false, 'missing credentials');
    return null;
  }
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

async function postFacebook(text) {
  const token = env('FACEBOOK_PAGE_ACCESS_TOKEN');
  const pageId = env('FACEBOOK_PAGE_ID');
  if (!token || !pageId) {
    log('facebook', false, 'missing credentials');
    return null;
  }
  const res = await fetch(`https://graph.facebook.com/v19.0/${pageId}/feed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: text, access_token: token }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Facebook ${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
  return data.id || null;
}

const MESSAGES = {
  twitter:
    'Beat the ATS + ace the interview with Resumora.\nAI resume & cover letter, EN/FR interview videos, luxury PDFs.\nOne-time payment. No subscription.\n#jobsearch #resume #career #ATS #interviewprep\n' +
    BRAND_URL,
  linkedin:
    'Your resume and your interview are one system.\n\nResumora fixes both:\n  • ATS-optimized resumes & cover letters\n  • Cinematic EN/FR interview training videos\n  • Luxury executive PDF templates\n  • One-time payment — no subscription\n\n→ ' +
    BRAND_URL,
  facebook:
    'Land more interviews with Resumora ✨\n\nAI-optimized resume + cover letter, interview training videos, and premium PDF templates — one simple payment, no monthly fees.\n\nStart now at ' +
    BRAND_URL,
};

exports.weeklySocialBlast = onSchedule(
  {
    schedule: '0 9 * * 1',
    timeZone: 'America/New_York',
    timeoutSeconds: 120,
    memory: '256MiB',
    region: 'us-central1',
  },
  async (event) => {
    const results = {};
    for (const [channel, fn, text] of [
      ['twitter', postTwitter, MESSAGES.twitter],
      ['linkedin', postLinkedIn, MESSAGES.linkedin],
      ['facebook', postFacebook, MESSAGES.facebook],
    ]) {
      try {
        const id = await fn(text);
        results[channel] = id ? { ok: true, id } : { ok: false, reason: 'unconfigured' };
        log(channel, Boolean(id), id || 'skipped');
      } catch (err) {
        results[channel] = { ok: false, error: err.message };
        log(channel, false, err.message);
      }
    }
    console.info(
      '[weeklySocialBlast] complete',
      JSON.stringify({ jobName: event.jobName, scheduleTime: event.scheduleTime, results })
    );
  }
);
