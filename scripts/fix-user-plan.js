/**
 * Hands-free fix: activate a Resumora user's plan in Firestore.
 *
 * Usage:
 *   node scripts/fix-user-plan.js
 *   node scripts/fix-user-plan.js --email=user@example.com --plan=basic
 *   node scripts/fix-user-plan.js --dry-run
 *
 * Auth (first match wins):
 *   1) GOOGLE_APPLICATION_CREDENTIALS or ./firebase-admin.json → Firebase Admin SDK
 *   2) Else: gcloud auth print-access-token → Identity Toolkit + Firestore REST
 *
 * Never prints secret values, tokens, or credential JSON.
 */

import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const PROJECT_ID =
  process.env.GOOGLE_CLOUD_PROJECT ||
  process.env.GCLOUD_PROJECT ||
  process.env.FIREBASE_PROJECT ||
  'resumora-live';

const DEFAULT_EMAIL = 'ahmadlatifzz20@gmail.com';
const DEFAULT_PLAN = 'basic';

function parseArgs(argv) {
  const out = {
    email: DEFAULT_EMAIL,
    plan: DEFAULT_PLAN,
    dryRun: false,
  };
  for (const raw of argv.slice(2)) {
    if (raw === '--dry-run') out.dryRun = true;
    else if (raw.startsWith('--email=')) out.email = String(raw.slice(8)).trim();
    else if (raw.startsWith('--plan=')) out.plan = String(raw.slice(7)).trim().toLowerCase();
  }
  return out;
}

function resolveCredentialPath() {
  const envPath = String(process.env.GOOGLE_APPLICATION_CREDENTIALS || '').trim();
  if (envPath && fs.existsSync(envPath)) return envPath;
  const local = path.join(REPO_ROOT, 'firebase-admin.json');
  if (fs.existsSync(local)) return local;
  return '';
}

function resolveGcloudBin() {
  const fromEnv = String(process.env.GCLOUD_PATH || process.env.CLOUDSDK_ROOT || '').trim();
  const candidates = [
    fromEnv,
    fromEnv ? path.join(fromEnv, 'bin', 'gcloud.cmd') : '',
    fromEnv ? path.join(fromEnv, 'bin', 'gcloud') : '',
    path.join(
      process.env.LOCALAPPDATA || '',
      'Google',
      'Cloud SDK',
      'google-cloud-sdk',
      'bin',
      process.platform === 'win32' ? 'gcloud.cmd' : 'gcloud'
    ),
    path.join(
      process.env.ProgramFiles || 'C:\\Program Files',
      'Google',
      'Cloud SDK',
      'google-cloud-sdk',
      'bin',
      process.platform === 'win32' ? 'gcloud.cmd' : 'gcloud'
    ),
    'gcloud',
  ].filter(Boolean);

  for (const c of candidates) {
    if (c === 'gcloud') continue;
    if (fs.existsSync(c)) return c;
  }
  return process.platform === 'win32' ? 'gcloud.cmd' : 'gcloud';
}

function gcloudAccessToken() {
  const bin = resolveGcloudBin();
  let token = '';
  try {
    // Prefer PowerShell on Windows — execFileSync(.cmd) often returns EINVAL.
    if (process.platform === 'win32') {
      token = execFileSync(
        'powershell.exe',
        ['-NoProfile', '-Command', `& '${bin.replace(/'/g, "''")}' auth print-access-token`],
        {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true,
        }
      ).trim();
    } else {
      token = execFileSync(bin, ['auth', 'print-access-token'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim();
    }
  } catch (err) {
    throw new Error(
      `gcloud token failed: ${String(err && err.message ? err.message : err).slice(0, 160)}`
    );
  }
  if (!token) throw new Error('gcloud auth print-access-token returned empty');
  return token;
}

async function restJson(method, url, token, body) {
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'x-goog-user-project': PROJECT_ID,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: String(text).slice(0, 200) };
  }
  if (!res.ok) {
    const msg = data.error?.message || data.error || text || res.statusText;
    const err = new Error(`${method} ${res.status}: ${String(msg).slice(0, 240)}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

function firestoreString(v) {
  return { stringValue: String(v ?? '') };
}
function firestoreBool(v) {
  return { booleanValue: Boolean(v) };
}
function firestoreTimestampNow() {
  return { timestampValue: new Date().toISOString() };
}

async function lookupUidByEmailRest(token, email) {
  const url = `https://identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:lookup`;
  try {
    const data = await restJson('POST', url, token, { email: [email] });
    const user = Array.isArray(data.users) ? data.users[0] : null;
    if (user?.localId) {
      return { uid: String(user.localId), email: user.email || email };
    }
  } catch (err) {
    if (err.status === 200 || String(err.message || '').includes('USER_NOT_FOUND')) {
      return null;
    }
    // Some projects return 400 USER_NOT_FOUND
    if (String(err.message || '').includes('USER_NOT_FOUND')) return null;
    throw err;
  }
  return null;
}

async function findUidByEmailFieldRest(token, email) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery`;
  const data = await restJson('POST', url, token, {
    structuredQuery: {
      from: [{ collectionId: 'users' }],
      where: {
        fieldFilter: {
          field: { fieldPath: 'email' },
          op: 'EQUAL',
          value: firestoreString(email),
        },
      },
      limit: 1,
    },
  });
  const rows = Array.isArray(data) ? data : [];
  const doc = rows.find((r) => r.document)?.document;
  if (!doc?.name) return null;
  const id = String(doc.name).split('/').pop();
  return { uid: id, email };
}

async function patchUserRest(token, uid, email, plan) {
  const fields = [
    'uid',
    'email',
    'plan',
    'planId',
    'planStatus',
    'subscriptionStatus',
    'paid',
    'purchaseDate',
    'updatedAt',
    'source',
  ];
  const mask = fields.map((f) => `updateMask.fieldPaths=${encodeURIComponent(f)}`).join('&');
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${encodeURIComponent(uid)}?${mask}`;
  const body = {
    fields: {
      uid: firestoreString(uid),
      email: firestoreString(email),
      plan: firestoreString(plan),
      planId: firestoreString(plan),
      planStatus: firestoreString('active'),
      subscriptionStatus: firestoreString('active'),
      paid: firestoreBool(true),
      purchaseDate: firestoreTimestampNow(),
      updatedAt: firestoreTimestampNow(),
      source: firestoreString('scripts/fix-user-plan.js'),
    },
  };
  // PATCH upserts missing docs when createTime not required
  return restJson('PATCH', url, token, body);
}

async function runViaRest({ email, plan, dryRun }) {
  console.log('[fix-user-plan] Using gcloud REST mode (token not printed).');
  const token = gcloudAccessToken();

  let uid = '';
  let authEmail = email;
  const authUser = await lookupUidByEmailRest(token, email);
  if (authUser) {
    uid = authUser.uid;
    authEmail = authUser.email;
    console.log(`[fix-user-plan] Auth user found uid=${uid}`);
  } else {
    console.warn(
      `[fix-user-plan] No Firebase Auth user for ${email}. Trying Firestore email lookup…`
    );
    const byEmail = await findUidByEmailFieldRest(token, email);
    if (byEmail) {
      uid = byEmail.uid;
      console.log(`[fix-user-plan] Found users/${uid} by email field`);
    }
  }

  if (!uid) {
    console.error(
      `[fix-user-plan] User not found in Auth or Firestore for email=${email}. Aborting.`
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    JSON.stringify({
      scope: 'fix-user-plan',
      mode: 'rest',
      projectId: PROJECT_ID,
      dryRun,
      uid,
      email: authEmail,
      plan,
      subscriptionStatus: 'active',
    })
  );

  if (dryRun) {
    console.log('[fix-user-plan] Dry run — no write performed.');
    return;
  }

  await patchUserRest(token, uid, authEmail, plan);
  console.log(
    `[fix-user-plan] SUCCESS — users/${uid} updated plan=${plan} subscriptionStatus=active`
  );
}

async function runViaAdmin({ email, plan, dryRun, credPath }) {
  const fromFunctions = path.join(REPO_ROOT, 'functions', 'node_modules', 'firebase-admin');
  let admin;
  try {
    admin = require(fromFunctions);
  } catch (_) {
    admin = require('firebase-admin');
  }

  process.env.GOOGLE_APPLICATION_CREDENTIALS = credPath;
  console.log('[fix-user-plan] Using service account file credentials (path not printed).');
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId: PROJECT_ID,
    });
  }

  const auth = admin.auth();
  const db = admin.firestore();

  let uid = '';
  let authEmail = email;
  try {
    const user = await auth.getUserByEmail(email);
    uid = user.uid;
    authEmail = user.email || email;
    console.log(`[fix-user-plan] Auth user found uid=${uid}`);
  } catch (err) {
    if (String(err.code || '') === 'auth/user-not-found') {
      console.warn(
        `[fix-user-plan] No Firebase Auth user for ${email}. Trying Firestore email lookup…`
      );
    } else {
      throw err;
    }
  }

  let userRef = uid ? db.collection('users').doc(uid) : null;
  if (!userRef) {
    const snap = await db.collection('users').where('email', '==', email).limit(1).get();
    if (!snap.empty) {
      userRef = snap.docs[0].ref;
      uid = snap.docs[0].id;
      console.log(`[fix-user-plan] Found users/${uid} by email field`);
    }
  }

  if (!userRef && !uid) {
    console.error(
      `[fix-user-plan] User not found in Auth or Firestore for email=${email}. Aborting.`
    );
    process.exitCode = 1;
    return;
  }
  if (!userRef) userRef = db.collection('users').doc(uid);

  const patch = {
    uid: uid || userRef.id,
    email: authEmail,
    plan,
    planId: plan,
    planStatus: 'active',
    subscriptionStatus: 'active',
    paid: true,
    purchaseDate: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    source: 'scripts/fix-user-plan.js',
  };

  console.log(
    JSON.stringify({
      scope: 'fix-user-plan',
      mode: 'admin-sdk',
      projectId: PROJECT_ID,
      dryRun,
      uid: patch.uid,
      email: authEmail,
      plan,
      subscriptionStatus: 'active',
    })
  );

  if (dryRun) {
    console.log('[fix-user-plan] Dry run — no write performed.');
    return;
  }

  const beforeExists = (await userRef.get()).exists;
  await userRef.set(patch, { merge: true });
  console.log(
    `[fix-user-plan] SUCCESS — users/${userRef.id} ${beforeExists ? 'updated' : 'created'} ` +
      `plan=${plan} subscriptionStatus=active`
  );
}

async function main() {
  const { email, plan, dryRun } = parseArgs(process.argv);
  if (!email || !email.includes('@')) {
    console.error('[fix-user-plan] Invalid --email');
    process.exitCode = 1;
    return;
  }
  if (!plan) {
    console.error('[fix-user-plan] Invalid --plan');
    process.exitCode = 1;
    return;
  }

  const credPath = resolveCredentialPath();
  if (credPath) {
    await runViaAdmin({ email, plan, dryRun, credPath });
  } else {
    await runViaRest({ email, plan, dryRun });
  }
}

main().catch((err) => {
  console.error(
    '[fix-user-plan] Fatal:',
    String(err && err.message ? err.message : err).slice(0, 300)
  );
  process.exitCode = 1;
});
