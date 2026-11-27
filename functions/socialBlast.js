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

// TikTok requires a video asset + an OAuth access token. The client key/secret
// are stored in Secret Manager (TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET) for the
// OAuth flow; posting needs TIKTOK_ACCESS_TOKEN + TIKTOK_VIDEO_URL (text-only is
// not supported by TikTok).
async function postTikTok(caption) {
  const accessToken = env('TIKTOK_ACCESS_TOKEN');
  const videoUrl = env('TIKTOK_VIDEO_URL');
  if (!accessToken || !videoUrl) {
    log('tiktok', false, 'missing access token or video url');
    return null;
  }
  const res = await fetch('https://open.tiktokapis.com/v2/post/publish/video/init/', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      post_info: { title: caption.slice(0, 2200), privacy_level: 'PUBLIC_TO_EVERYONE' },
      source_info: { source: 'PULL_FROM_URL', video_url: videoUrl },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`TikTok ${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
  return (data && data.data && data.data.publish_id) || null;
}

const MESSAGES = {
  twitter: {
    en:
      'Beat the ATS + ace the interview with Resumora.\nAI resume & cover letter, EN/FR interview videos, luxury PDFs.\nOne-time payment. No subscription.\n#jobsearch #resume #career #ATS #interviewprep\n' +
      BRAND_URL,
    fr:
      'Bat l\u2019ATS + r\u00e9ussis l\u2019entretien avec Resumora.\nCV & lettre IA, vid\u00e9os d\u2019entretien EN/FR, PDF premium.\nPaiement unique. Sans abonnement.\n#emploi #cv #carriere #ATS #entretien\n' +
      BRAND_URL,
    es:
      'Supera el ATS + triunfa en la entrevista con Resumora.\nCV y carta IA, videos de entrevista EN/FR, PDF premium.\nPago \u00fanico. Sin suscripci\u00f3n.\n#empleo #cv #carrera #ATS #entrevista\n' +
      BRAND_URL,
  },
  linkedin: {
    en:
      'Your resume and your interview are one system.\n\nResumora fixes both:\n  \u2022 ATS-optimized resumes & cover letters\n  \u2022 Cinematic EN/FR interview training videos\n  \u2022 Luxury executive PDF templates\n  \u2022 One-time payment \u2014 no subscription\n\n\u2192 ' +
      BRAND_URL,
    fr:
      'Votre CV et votre entretien forment un seul syst\u00e8me.\n\nResumora corrige les deux :\n  \u2022 CV et lettres optimis\u00e9s ATS\n  \u2022 Vid\u00e9os d\u2019entretien cin\u00e9matiques EN/FR\n  \u2022 Mod\u00e8les PDF ex\u00e9cutifs premium\n  \u2022 Paiement unique \u2014 sans abonnement\n\n\u2192 ' +
      BRAND_URL,
    es:
      'Tu CV y tu entrevista son un solo sistema.\n\nResumora corrige ambos:\n  \u2022 CV y cartas optimizados ATS\n  \u2022 Videos de entrevista cinematogr\u00e1ficos EN/FR\n  \u2022 Plantillas PDF ejecutivas premium\n  \u2022 Pago \u00fanico \u2014 sin suscripci\u00f3n\n\n\u2192 ' +
      BRAND_URL,
  },
  facebook: {
    en:
      'Land more interviews with Resumora \u2728\n\nAI-optimized resume + cover letter, interview training videos, and premium PDF templates \u2014 one simple payment, no monthly fees.\n\nStart now at ' +
      BRAND_URL,
    fr:
      'D\u00e9crochez plus d\u2019entretiens avec Resumora \u2728\n\nCV + lettre optimis\u00e9s IA, vid\u00e9os d\u2019entretien et mod\u00e8les PDF premium \u2014 un seul paiement, sans frais mensuels.\n\nCommencez sur ' +
      BRAND_URL,
    es:
      'Consigue m\u00e1s entrevistas con Resumora \u2728\n\nCV + carta optimizados con IA, videos de entrevista y plantillas PDF premium \u2014 un solo pago, sin cuotas mensuales.\n\nEmpieza en ' +
      BRAND_URL,
  },
  tiktok: {
    en:
      'Beat the ATS & ace interviews with Resumora \u2728\nAI resume + interview videos, one-time payment.\n#resume #interview #jobsearch ' +
      BRAND_URL,
    fr:
      'Bat l\u2019ATS & r\u00e9ussis tes entretiens avec Resumora \u2728\nCV IA + vid\u00e9os d\u2019entretien, paiement unique.\n#cv #entretien #emploi ' +
      BRAND_URL,
    es:
      'Supera el ATS & triunfa en entrevistas con Resumora \u2728\nCV IA + videos de entrevista, pago \u00fanico.\n#cv #entrevista #empleo ' +
      BRAND_URL,
  },
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
    const LANGS = ['en', 'fr', 'es'];
    const CHANNELS = [
      ['twitter', postTwitter],
      ['linkedin', postLinkedIn],
      ['facebook', postFacebook],
      ['tiktok', postTikTok],
    ];
    const results = {};
    for (const [channel, fn] of CHANNELS) {
      for (const lang of LANGS) {
        const key = `${channel}_${lang}`;
        try {
          const id = await fn(MESSAGES[channel][lang]);
          results[key] = id ? { ok: true, id } : { ok: false, reason: 'unconfigured' };
          log(key, Boolean(id), id || 'skipped');
        } catch (err) {
          results[key] = { ok: false, error: err.message };
          log(key, false, err.message);
        }
      }
    }
    console.info(
      '[weeklySocialBlast] complete',
      JSON.stringify({ jobName: event.jobName, scheduleTime: event.scheduleTime, results })
    );
  }
);
