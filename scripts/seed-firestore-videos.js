/**
 * Seed Firestore `videos` collection for Resumora Video Library.
 *
 * - Uploads public/videos/*.mp4 to GCS masters/ (unless --skip-upload)
 * - Writes 4 docs with titles, descriptions, url_mp4_*, captions_*
 * - Catalog API (functions/heygen.js getCatalog) prefers Firestore when url_mp4_en is https
 *
 * Usage:
 *   node scripts/seed-firestore-videos.js
 *   node scripts/seed-firestore-videos.js --skip-upload
 *   node scripts/seed-firestore-videos.js --hosting-urls
 *
 * Never prints secret values.
 */

import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const MASTERS_DIR = path.join(REPO_ROOT, 'public', 'videos');
const PROJECT = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || 'resumora-live';
const HOSTING_BASE = String(process.env.RESUMORA_BASE_URL || 'https://resumora.net').replace(
  /\/$/,
  ''
);

function bucketName() {
  return process.env.GCS_BUCKET_NAME || process.env.VEO_OUTPUT_BUCKET || 'resumora-videos';
}

const META = [
  {
    id: 'vid-resume-writing',
    order: 1,
    title_en: 'Resume writing that gets interviews',
    title_fr: 'Rediger un CV qui obtient des entretiens',
    title_es: 'Redaccion de CV que consigue entrevistas',
    description_en: 'Structure, impact bullets, and role targeting in 5 minutes.',
    description_fr: 'Structure, puces d impact et ciblage du poste en 5 minutes.',
    description_es: 'Estructura, logros medibles y enfoque al puesto en 5 minutos.',
  },
  {
    id: 'vid-ats-optimization',
    order: 2,
    title_en: 'ATS optimization essentials',
    title_fr: 'Essentiels de l optimisation ATS',
    title_es: 'Fundamentos de optimizacion ATS',
    description_en: 'Keywords, formatting, and parser-safe layouts recruiters rely on.',
    description_fr: 'Mots-cles, mise en forme et structures compatibles parseurs.',
    description_es: 'Palabras clave, formato y disenos seguros para parsers.',
  },
  {
    id: 'vid-linkedin-tips',
    order: 3,
    title_en: 'LinkedIn tips that sync with your resume',
    title_fr: 'Astuces LinkedIn alignees sur votre CV',
    title_es: 'Consejos LinkedIn alineados con su CV',
    description_en: 'Headline, About, and experience alignment for recruiter search.',
    description_fr: 'Titre, A propos et experiences pour la recherche recruteurs.',
    description_es: 'Titular, Acerca de y experiencia para busquedas de reclutadores.',
  },
  {
    id: 'vid-interview-prep',
    order: 4,
    title_en: 'Interview preparation that closes offers',
    title_fr: 'Preparation d entretien qui conclut des offres',
    title_es: 'Preparacion de entrevistas que cierra ofertas',
    description_en: 'STAR answers, closing questions, and calm delivery under pressure.',
    description_fr: 'Reponses STAR, questions de cloture et aisance sous pression.',
    description_es: 'Respuestas STAR, cierre y dominio bajo presion.',
  },
];

function parseArgs(argv) {
  return {
    skipUpload: argv.includes('--skip-upload'),
    hostingUrls: argv.includes('--hosting-urls'),
  };
}

function log(msg) {
  console.log(`[seed-firestore-videos] ${msg}`);
}

function gcloud(args) {
  const bin = process.platform === 'win32' ? 'gcloud.cmd' : 'gcloud';
  const r = spawnSync(bin, args, { encoding: 'utf8', shell: true });
  if (r.status !== 0) {
    throw new Error((r.stderr || r.stdout || `gcloud exit ${r.status}`).slice(0, 300));
  }
  return String(r.stdout || '').trim();
}

function findLocalMaster(id) {
  const candidates = [
    path.join(MASTERS_DIR, `${id}.mp4`),
    path.join(MASTERS_DIR, `${id}-en.mp4`),
    path.join(MASTERS_DIR, `${id}.en.mp4`),
  ];
  return candidates.find((p) => fs.existsSync(p)) || null;
}

function publicGcsUrl(objectName) {
  return `https://storage.googleapis.com/${bucketName()}/${objectName}`;
}

function captionUrl(id, lang) {
  return `${HOSTING_BASE}/subtitles/${id}.${lang}.vtt`;
}

function hostingVideoUrl(id) {
  return `${HOSTING_BASE}/videos/${id}.mp4`;
}

async function patchFirestoreDoc(id, fields) {
  const token = gcloud(['auth', 'print-access-token', `--project=${PROJECT}`]);
  const uri = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/videos/${id}`;
  const fsFields = {};
  for (const [key, val] of Object.entries(fields)) {
    if (typeof val === 'number') {
      fsFields[key] = { integerValue: String(Math.trunc(val)) };
    } else if (typeof val === 'boolean') {
      fsFields[key] = { booleanValue: val };
    } else {
      fsFields[key] = { stringValue: String(val) };
    }
  }
  const res = await fetch(uri, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ fields: fsFields }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Firestore PATCH ${id} failed HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const bucket = bucketName();
  log(`Project=${PROJECT}`);

  const missing = [];
  for (const meta of META) {
    const local = findLocalMaster(meta.id);
    if (!local && !args.hostingUrls) {
      missing.push(meta.id);
      continue;
    }

    let urlEn;
    if (args.hostingUrls) {
      urlEn = hostingVideoUrl(meta.id);
    } else {
      if (!args.skipUpload) {
        const object = `masters/${meta.id}-en.mp4`;
        log(`Upload ${path.basename(local)} → GCS masters/`);
        gcloud(['storage', 'cp', local, `gs://${bucket}/${object}`, `--project=${PROJECT}`]);
      }
      urlEn = publicGcsUrl(`masters/${meta.id}-en.mp4`);
    }

    const fields = {
      id: meta.id,
      order: meta.order,
      duration: 300,
      title_en: meta.title_en,
      title_fr: meta.title_fr,
      title_es: meta.title_es,
      title_EN: meta.title_en,
      title_FR: meta.title_fr,
      title_ES: meta.title_es,
      description_en: meta.description_en,
      description_fr: meta.description_fr,
      description_es: meta.description_es,
      description_EN: meta.description_en,
      description_FR: meta.description_fr,
      description_ES: meta.description_es,
      url_mp4_en: urlEn,
      url_mp4_fr: urlEn,
      url_mp4_es: urlEn,
      captions_en: captionUrl(meta.id, 'en'),
      captions_fr: captionUrl(meta.id, 'fr'),
      captions_es: captionUrl(meta.id, 'es'),
      source: args.hostingUrls ? 'hosting' : 'gcs',
      updatedAt: new Date().toISOString(),
    };

    await patchFirestoreDoc(meta.id, fields);
    log(`Firestore upserted videos/${meta.id}`);
  }

  if (missing.length) {
    throw new Error(
      `Missing local masters for: ${missing.join(', ')}. Run node scripts/generate-resumora-masters.js first, or pass --hosting-urls after Hosting deploy.`
    );
  }

  console.log('');
  console.log('DONE — Firestore videos seeded.');
  console.log('Verify: curl.exe https://resumora.net/api/video/catalog');
  console.log('Expect: "source":"firestore"');
}

main().catch((err) => {
  console.error(`aborted: ${err.message}`);
  process.exit(1);
});
