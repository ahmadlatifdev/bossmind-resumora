/**
 * Marketing social profile URLs (client-safe).
 * Values come from Vite env only — never hard-code secrets or price ids.
 */

const SOCIAL_HOSTS = Object.freeze({
  facebook: ['facebook.com', 'www.facebook.com', 'fb.com', 'www.fb.com', 'm.facebook.com'],
  instagram: ['instagram.com', 'www.instagram.com'],
  tiktok: ['tiktok.com', 'www.tiktok.com', 'vm.tiktok.com'],
  x: ['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com'],
  linkedin: ['linkedin.com', 'www.linkedin.com'],
  youtube: ['youtube.com', 'www.youtube.com', 'youtu.be', 'm.youtube.com'],
  bilibili: ['bilibili.com', 'www.bilibili.com', 'space.bilibili.com', 'm.bilibili.com'],
});

/** Strip click-ids that can break sessions / campaigns; keep intentional utm_* if present. */
const STRIP_PARAMS = new Set([
  'fbclid',
  'gclid',
  'gbraid',
  'wbraid',
  'msclkid',
  'twclid',
  'li_fat_id',
  'mc_cid',
  'mc_eid',
  'igshid',
  'si',
]);

function firstEnv(keys) {
  for (const key of keys) {
    const v = import.meta.env[key];
    if (v && String(v).trim()) return String(v).trim();
  }
  return '';
}

function hostAllowed(hostname, allowed) {
  const h = String(hostname || '').toLowerCase();
  return allowed.some((d) => h === d || h.endsWith(`.${d}`));
}

/**
 * Normalize a profile URL: require https, known host, strip dangerous click-ids.
 * @returns {string|null}
 */
export function sanitizeSocialUrl(raw, platform) {
  const input = String(raw || '').trim();
  if (!input) return null;
  let url;
  try {
    url = new URL(input);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  const allowed = SOCIAL_HOSTS[platform];
  if (!allowed || !hostAllowed(url.hostname, allowed)) return null;

  for (const key of [...url.searchParams.keys()]) {
    if (STRIP_PARAMS.has(key.toLowerCase())) {
      url.searchParams.delete(key);
    }
  }
  // Prefer clean profile paths without hash tracking junk
  url.hash = '';
  return url.toString().replace(/\/$/, '') === url.origin ? `${url.origin}/` : url.toString();
}

/**
 * @returns {{ id: string, href: string, labelKey: string }[]}
 */
export function getSocialLinks() {
  const specs = [
    {
      id: 'facebook',
      labelKey: 'footer.social.facebook',
      keys: ['VITE_SOCIAL_FACEBOOK_URL', 'VITE_FACEBOOK_URL'],
    },
    {
      id: 'instagram',
      labelKey: 'footer.social.instagram',
      keys: ['VITE_SOCIAL_INSTAGRAM_URL', 'VITE_INSTAGRAM_URL'],
    },
    {
      id: 'tiktok',
      labelKey: 'footer.social.tiktok',
      keys: ['VITE_SOCIAL_TIKTOK_URL', 'VITE_TIKTOK_URL'],
    },
    {
      id: 'x',
      labelKey: 'footer.social.x',
      keys: ['VITE_SOCIAL_X_URL', 'VITE_TWITTER_URL', 'VITE_SOCIAL_TWITTER_URL'],
    },
    {
      id: 'linkedin',
      labelKey: 'footer.social.linkedin',
      keys: ['VITE_SOCIAL_LINKEDIN_URL', 'VITE_LINKEDIN_URL'],
    },
    {
      id: 'youtube',
      labelKey: 'footer.social.youtube',
      keys: ['VITE_SOCIAL_YOUTUBE_URL', 'VITE_YOUTUBE_URL'],
    },
    {
      id: 'bilibili',
      labelKey: 'footer.social.bilibili',
      keys: ['VITE_SOCIAL_BILIBILI_URL', 'VITE_BILIBILI_URL'],
    },
  ];

  const out = [];
  for (const spec of specs) {
    const href = sanitizeSocialUrl(firstEnv(spec.keys), spec.id);
    if (href) out.push({ id: spec.id, href, labelKey: spec.labelKey });
  }
  return out;
}

export function socialEnvMapped() {
  return {
    facebook: Boolean(firstEnv(['VITE_SOCIAL_FACEBOOK_URL', 'VITE_FACEBOOK_URL'])),
    instagram: Boolean(firstEnv(['VITE_SOCIAL_INSTAGRAM_URL', 'VITE_INSTAGRAM_URL'])),
    tiktok: Boolean(firstEnv(['VITE_SOCIAL_TIKTOK_URL', 'VITE_TIKTOK_URL'])),
    x: Boolean(firstEnv(['VITE_SOCIAL_X_URL', 'VITE_TWITTER_URL', 'VITE_SOCIAL_TWITTER_URL'])),
    linkedin: Boolean(firstEnv(['VITE_SOCIAL_LINKEDIN_URL', 'VITE_LINKEDIN_URL'])),
    youtube: Boolean(firstEnv(['VITE_SOCIAL_YOUTUBE_URL', 'VITE_YOUTUBE_URL'])),
    bilibili: Boolean(firstEnv(['VITE_SOCIAL_BILIBILI_URL', 'VITE_BILIBILI_URL'])),
  };
}
