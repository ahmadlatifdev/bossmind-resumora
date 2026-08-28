import { getFirestore, collection, addDoc, getDocs, query, where, limit } from 'firebase/firestore';
import { app } from './firebase';
import { MAX_VIDEO_DOWNLOADS } from './videoLibrary.js';

const ACCESS_KEY = 'resumora_video_downloads_v2';
const RESUME_KEY = 'resumora_resume_draft_v1';
const CLIENT_KEY = 'resumora_client_id';

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (_) {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (_) {
    /* ignore */
  }
}

export function getClientId() {
  try {
    let id = localStorage.getItem(CLIENT_KEY);
    if (!id) {
      id = `anon_${crypto.randomUUID()}`;
      localStorage.setItem(CLIENT_KEY, id);
    }
    return id;
  } catch (_) {
    return 'anon_local';
  }
}

function localDownloads() {
  const data = readJson(ACCESS_KEY, { items: [] });
  return Array.isArray(data.items) ? data.items : [];
}

export function getLocalDownloadCount() {
  return localDownloads().length;
}

export function remainingVideoDownloads() {
  return Math.max(0, MAX_VIDEO_DOWNLOADS - getLocalDownloadCount());
}

export function hasDownloadedVideo(videoId, language) {
  return localDownloads().some(
    (row) => row.videoId === videoId && (!language || row.language === language)
  );
}

async function firestoreDownloadCount(userId) {
  try {
    const db = getFirestore(app);
    const q = query(collection(db, 'user_downloads'), where('user_id', '==', userId), limit(20));
    const snap = await getDocs(q);
    return snap.size;
  } catch (_) {
    return null; // rules/offline → fall back to local
  }
}

/**
 * Enforce max 5 downloads. Tries Firestore, always mirrors localStorage.
 */
export async function recordVideoDownload({ videoId, language, action = 'download' }) {
  const userId = getClientId();
  const localItems = localDownloads();

  const already = localItems.some((row) => row.videoId === videoId && row.language === language);
  if (already) {
    return {
      ok: true,
      remaining: Math.max(0, MAX_VIDEO_DOWNLOADS - localItems.length),
      reused: true,
    };
  }

  const remoteCount = await firestoreDownloadCount(userId);
  const effectiveCount =
    remoteCount == null ? localItems.length : Math.max(remoteCount, localItems.length);

  if (effectiveCount >= MAX_VIDEO_DOWNLOADS) {
    return { ok: false, remaining: 0, reason: 'limit' };
  }

  const entry = {
    user_id: userId,
    video_id: videoId,
    language,
    action,
    downloaded_at: new Date().toISOString(),
  };

  localItems.push({
    videoId,
    language,
    action,
    accessedAt: entry.downloaded_at,
  });
  writeJson(ACCESS_KEY, { items: localItems });

  try {
    const db = getFirestore(app);
    await addDoc(collection(db, 'user_downloads'), entry);
  } catch (_) {
    /* local enforcement still valid */
  }

  return {
    ok: true,
    remaining: Math.max(0, MAX_VIDEO_DOWNLOADS - localItems.length),
  };
}

export async function downloadMp4(url, filename) {
  const res = await fetch(url, { mode: 'cors' });
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename || 'resumora-video.mp4';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}

export function downloadTextFile(filename, body) {
  const blob = new Blob([body], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function saveResumeDraft(draft) {
  writeJson(RESUME_KEY, { ...draft, updatedAt: new Date().toISOString() });
}

export function loadResumeDraft() {
  return readJson(RESUME_KEY, null);
}

export function parseUnstructuredResumeText(raw) {
  const text = String(raw || '')
    .replace(/\r/g, '')
    .trim();
  if (!text) {
    return {
      source: 'unstructured_empty',
      fullName: '',
      email: '',
      phone: '',
      summary: '',
      skills: '',
      experience: [],
      rawText: '',
    };
  }

  const emailMatch = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  const phoneMatch = text.match(
    /(?:\+?\d{1,3}[\s().-]*)?(?:\(?\d{3}\)?[\s().-]*)?\d{3}[\s().-]*\d{4}/
  );
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  // Prefer a human name line: skip emails, phones, section headers, URLs
  const nameGuess =
    lines.find((l) => {
      if (l.includes('@') || /https?:\/\//i.test(l)) return false;
      if (/^(\+?\d[\d\s().-]{7,}\d)$/.test(l)) return false;
      if (
        /^(summary|experience|education|skills|compétence|competencias|profile|objective)\b/i.test(
          l
        )
      ) {
        return false;
      }
      const words = l.split(/\s+/);
      return words.length >= 2 && words.length <= 6 && l.length <= 80;
    }) || (lines[0] && !lines[0].includes('@') ? lines[0].slice(0, 80) : '');

  const skillsIdx = lines.findIndex((l) =>
    /^(skills|compétences|competencias|habilidades|technical skills)\b/i.test(l)
  );
  let skills = '';
  if (skillsIdx >= 0) {
    const chunk = [lines[skillsIdx].replace(/^[^:]*:\s*/i, '')];
    for (let i = skillsIdx + 1; i < Math.min(skillsIdx + 6, lines.length); i += 1) {
      if (/^(experience|éducation|education|education|summary|work|employment)\b/i.test(lines[i])) {
        break;
      }
      chunk.push(lines[i]);
    }
    skills = chunk.filter(Boolean).join(', ').replace(/\s+/g, ' ').trim();
  } else {
    const skillsLine = lines.find((l) => /skill|compétence|competenc|habilidad/i.test(l)) || '';
    skills = skillsLine.replace(/^[^:]*:\s*/i, '').trim();
  }

  const experience = lines
    .filter((l) =>
      /experience|expérience|experiencia|worked|engineer|manager|analyst|developer|director/i.test(
        l
      )
    )
    .slice(0, 8);

  return {
    source: 'unstructured_parser',
    fullName: nameGuess,
    email: emailMatch?.[0] || '',
    phone: (phoneMatch?.[0] || '').trim(),
    summary: lines.slice(0, 4).join(' ').slice(0, 400),
    skills,
    experience,
    rawText: text,
  };
}

/** @deprecated use remainingVideoDownloads */
export function remainingVideoAccess() {
  return remainingVideoDownloads();
}

/** @deprecated use recordVideoDownload */
export function recordVideoAccess(videoId, action = 'run') {
  return recordVideoDownload({ videoId, language: 'en', action });
}

export function hasAccessedVideo(videoId) {
  return localDownloads().some((row) => row.videoId === videoId);
}
