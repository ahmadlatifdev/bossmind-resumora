const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const ADMIN_ONLY = [
  'readFile',
  'writeFile',
  'runBuild',
  'deployHosting',
  'updateFirestore',
  'runHealthCycle',
  'regenerateManual',
];

function assertAllowed(tool, scope) {
  if (ADMIN_ONLY.indexOf(tool) !== -1 && scope !== 'admin') {
    throw new Error('Tool ' + tool + ' is admin-only');
  }
}

async function readFile({ filePath }) {
  return { content: fs.readFileSync(path.resolve(filePath), 'utf8') };
}

async function writeFile({ filePath, content }) {
  fs.writeFileSync(path.resolve(filePath), content, 'utf8');
  return { ok: true };
}

async function runBuild() {
  return new Promise(function (resolve, reject) {
    exec('npm run build', { cwd: process.cwd() }, function (err, stdout, stderr) {
      if (err) reject(new Error(stderr || err.message));
      else resolve({ stdout: stdout.slice(-2000) });
    });
  });
}

async function deployHosting() {
  return new Promise(function (resolve, reject) {
    exec('firebase deploy --only hosting', { cwd: process.cwd() }, function (err, stdout, stderr) {
      if (err) reject(new Error(stderr || err.message));
      else resolve({ stdout: stdout.slice(-2000) });
    });
  });
}

async function updateFirestore({ collection, docId, data }) {
  const db = admin.firestore();
  await db.collection(collection).doc(docId).set(data, { merge: true });
  return { ok: true };
}

async function runHealthCycle() {
  const db = admin.firestore();
  await db
    .collection('shared_memory')
    .doc('health_trigger')
    .set({ triggeredAt: admin.firestore.FieldValue.serverTimestamp() });
  return { ok: true };
}

async function regenerateManual() {
  const db = admin.firestore();
  await db
    .collection('manual')
    .doc('bossmind')
    .set(
      { regenerateRequested: true, requestedAt: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true }
    );
  return { ok: true };
}

async function searchDocs({ query }) {
  return { results: [], query: query, note: 'stub' };
}

async function getFaq() {
  return { faqs: [{ q: 'How do I reset my password?', a: 'Use the reset-password page.' }] };
}

async function explainFeature({ feature }) {
  return { feature: feature, explanation: 'Feature ' + feature + ' is part of BossMind Resumora.' };
}

async function checkOrderStatus({ orderId }) {
  return { orderId: orderId, status: 'unknown' };
}

async function createSupportTicket({ email, summary, sessionId }) {
  const db = admin.firestore();
  const ref = await db.collection('support_tickets').add({
    email: email,
    summary: summary,
    sessionId: sessionId,
    status: 'open',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return { ticketId: ref.id };
}

module.exports = {
  readFile: readFile,
  writeFile: writeFile,
  runBuild: runBuild,
  deployHosting: deployHosting,
  updateFirestore: updateFirestore,
  runHealthCycle: runHealthCycle,
  regenerateManual: regenerateManual,
  searchDocs: searchDocs,
  getFaq: getFaq,
  explainFeature: explainFeature,
  checkOrderStatus: checkOrderStatus,
  createSupportTicket: createSupportTicket,
  assertAllowed: assertAllowed,
};
