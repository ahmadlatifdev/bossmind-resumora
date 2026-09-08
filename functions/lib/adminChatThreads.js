/**
 * Multi-threaded admin chat (Firestore).
 * Collections: conversations, messages
 * No new deps.
 */
'use strict';

const { FieldValue } = require('firebase-admin/firestore');

const CONVERSATIONS = 'conversations';
const MESSAGES = 'messages';

function tsToIso(value) {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  if (typeof value === 'string') return value;
  return null;
}

function titleFromQuestion(text) {
  const cleaned = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return 'New chat';
  return cleaned.length > 72 ? `${cleaned.slice(0, 69)}…` : cleaned;
}

async function listConversations(db, { limit = 100 } = {}) {
  const lim = Math.min(Math.max(Number(limit) || 100, 1), 500);
  let snap;
  try {
    snap = await db.collection(CONVERSATIONS).orderBy('updated_at', 'desc').limit(lim).get();
  } catch (_) {
    snap = await db.collection(CONVERSATIONS).limit(lim).get();
  }
  const rows = snap.docs.map((doc) => {
    const d = doc.data() || {};
    return {
      id: doc.id,
      title: String(d.title || 'Untitled'),
      created_at: tsToIso(d.created_at),
      updated_at: tsToIso(d.updated_at),
    };
  });
  rows.sort((a, b) => {
    const ta = a.updated_at ? Date.parse(a.updated_at) : 0;
    const tb = b.updated_at ? Date.parse(b.updated_at) : 0;
    return tb - ta;
  });
  return rows;
}

async function getConversation(db, conversationId) {
  const id = String(conversationId || '').trim();
  if (!id) {
    const err = new Error('conversation id required');
    err.statusCode = 400;
    throw err;
  }
  const convRef = db.collection(CONVERSATIONS).doc(id);
  const convSnap = await convRef.get();
  if (!convSnap.exists) {
    const err = new Error('conversation not found');
    err.statusCode = 404;
    throw err;
  }
  const d = convSnap.data() || {};
  let msgSnap;
  try {
    msgSnap = await db
      .collection(MESSAGES)
      .where('conversation_id', '==', id)
      .orderBy('timestamp', 'asc')
      .limit(2000)
      .get();
  } catch (_) {
    msgSnap = await db.collection(MESSAGES).where('conversation_id', '==', id).limit(2000).get();
  }
  const messages = msgSnap.docs.map((doc) => {
    const m = doc.data() || {};
    return {
      id: doc.id,
      conversation_id: id,
      role: m.role === 'assistant' || m.role === 'hermes' ? 'assistant' : 'user',
      content: String(m.content || m.text || ''),
      timestamp: tsToIso(m.timestamp),
      engine: m.engine || null,
    };
  });
  messages.sort((a, b) => {
    const ta = a.timestamp ? Date.parse(a.timestamp) : 0;
    const tb = b.timestamp ? Date.parse(b.timestamp) : 0;
    return ta - tb;
  });
  return {
    id,
    title: String(d.title || 'Untitled'),
    created_at: tsToIso(d.created_at),
    updated_at: tsToIso(d.updated_at),
    messages,
  };
}

async function createConversation(db, { title } = {}) {
  const now = FieldValue.serverTimestamp();
  const ref = await db.collection(CONVERSATIONS).add({
    title: titleFromQuestion(title || 'New chat'),
    created_at: now,
    updated_at: now,
  });
  const snap = await ref.get();
  const d = snap.data() || {};
  return {
    id: ref.id,
    title: String(d.title || title || 'New chat'),
    created_at: tsToIso(d.created_at) || new Date().toISOString(),
    updated_at: tsToIso(d.updated_at) || new Date().toISOString(),
  };
}

async function deleteConversation(db, conversationId) {
  const id = String(conversationId || '').trim();
  if (!id) {
    const err = new Error('conversation id required');
    err.statusCode = 400;
    throw err;
  }
  const convRef = db.collection(CONVERSATIONS).doc(id);
  const convSnap = await convRef.get();
  if (!convSnap.exists) {
    const err = new Error('conversation not found');
    err.statusCode = 404;
    throw err;
  }
  const msgSnap = await db.collection(MESSAGES).where('conversation_id', '==', id).limit(500).get();
  const batch = db.batch();
  msgSnap.docs.forEach((doc) => batch.delete(doc.ref));
  batch.delete(convRef);
  await batch.commit();
  // Best-effort extra pages if >500 messages
  let more = true;
  while (more) {
    const extra = await db.collection(MESSAGES).where('conversation_id', '==', id).limit(500).get();
    if (extra.empty) {
      more = false;
      break;
    }
    const b2 = db.batch();
    extra.docs.forEach((doc) => b2.delete(doc.ref));
    await b2.commit();
    if (extra.size < 500) more = false;
  }
  return { ok: true, id };
}

async function ensureConversation(db, conversationId, { titleFrom } = {}) {
  const id = String(conversationId || '').trim();
  if (!id) {
    const err = new Error('conversation_id required');
    err.statusCode = 400;
    throw err;
  }
  const ref = db.collection(CONVERSATIONS).doc(id);
  const snap = await ref.get();
  if (!snap.exists) {
    const now = FieldValue.serverTimestamp();
    await ref.set({
      title: titleFromQuestion(titleFrom || 'New chat'),
      created_at: now,
      updated_at: now,
    });
    return id;
  }
  return id;
}

async function appendMessage(db, { conversationId, role, content, engine }) {
  const id = await ensureConversation(db, conversationId, { titleFrom: content });
  const now = FieldValue.serverTimestamp();
  const convRef = db.collection(CONVERSATIONS).doc(id);
  const convSnap = await convRef.get();
  const data = convSnap.data() || {};
  const updates = { updated_at: now };
  // Auto-title from first user question when still default
  if (role === 'user' && (!data.title || data.title === 'New chat' || data.title === 'Untitled')) {
    updates.title = titleFromQuestion(content);
  }
  await convRef.set(updates, { merge: true });
  const msgRef = await db.collection(MESSAGES).add({
    conversation_id: id,
    role: role === 'assistant' || role === 'hermes' ? 'assistant' : 'user',
    content: String(content || '').slice(0, 32000),
    timestamp: now,
    engine: engine || null,
  });
  return { id: msgRef.id, conversation_id: id };
}

async function persistTurn(db, { conversationId, userText, assistantText, engine }) {
  if (userText) {
    await appendMessage(db, {
      conversationId,
      role: 'user',
      content: userText,
    });
  }
  if (assistantText) {
    await appendMessage(db, {
      conversationId,
      role: 'assistant',
      content: assistantText,
      engine,
    });
  }
}

module.exports = {
  CONVERSATIONS,
  MESSAGES,
  titleFromQuestion,
  listConversations,
  getConversation,
  createConversation,
  deleteConversation,
  ensureConversation,
  appendMessage,
  persistTurn,
};
