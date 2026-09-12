const admin = require('firebase-admin');

async function pending(toolCall, user) {
  const db = admin.firestore();
  const ref = await db.collection('harness_audit_log').add({
    status: 'pending',
    tool: toolCall.tool,
    args: toolCall.args || {},
    sessionId: toolCall.sessionId || null,
    user: user,
    startedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return ref.id;
}

async function final(docId, result) {
  const db = admin.firestore();
  await db
    .collection('harness_audit_log')
    .doc(docId)
    .set(
      {
        status: result.ok ? 'success' : 'error',
        result: result.out || result.error || null,
        finishedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
}

module.exports = { pending, final };
