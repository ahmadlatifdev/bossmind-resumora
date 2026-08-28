/**
 * Firestore users/{uid} profile helpers (client).
 */
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from './firebase';

/**
 * @typedef {object} UserProfile
 * @property {string} uid
 * @property {string} [email]
 * @property {string} [fullName]
 * @property {string|null} [stripeCustomerId]
 * @property {string|null} [plan]
 * @property {string} [planStatus]
 * @property {string|null} [purchaseDate]
 * @property {string} [subscriptionStatus]
 */

/**
 * Ensure users/{uid} exists after register / Google sign-in.
 * @param {import('firebase/auth').User} user
 * @param {{ fullName?: string }} [extra]
 */
export async function upsertUserProfile(user, extra = {}) {
  if (!user?.uid) return null;
  const ref = doc(db, 'users', user.uid);
  const snap = await getDoc(ref);
  const email = user.email || '';
  const fullName =
    String(extra.fullName || '').trim() ||
    String(user.displayName || '').trim() ||
    (snap.exists() ? String(snap.data()?.fullName || '') : '') ||
    '';

  const base = {
    uid: user.uid,
    email: email || null,
    fullName: fullName || null,
    updatedAt: serverTimestamp(),
  };

  // Persist UI locale when provided (used for invoice emails).
  if (extra.locale) {
    base.locale = String(extra.locale).toLowerCase().slice(0, 2);
  }

  if (!snap.exists()) {
    await setDoc(ref, {
      ...base,
      stripeCustomerId: null,
      plan: null,
      planStatus: 'pending',
      purchaseDate: null,
      subscriptionStatus: 'pending',
      createdAt: serverTimestamp(),
      source: 'client_registration',
    });
  } else {
    await setDoc(ref, base, { merge: true });
  }

  const next = await getDoc(ref);
  return next.exists() ? /** @type {UserProfile} */ ({ uid: user.uid, ...next.data() }) : null;
}

/**
 * @param {string} uid
 * @returns {Promise<UserProfile|null>}
 */
export async function loadUserProfile(uid) {
  if (!uid) return null;
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) return null;
  return /** @type {UserProfile} */ ({ uid, ...snap.data() });
}

export function isPlanActive(profile) {
  if (!profile) return false;
  const planStatus = String(profile.planStatus || '').toLowerCase();
  const sub = String(profile.subscriptionStatus || '').toLowerCase();
  const service = String(profile.serviceStatus || '').toLowerCase();
  return (
    planStatus === 'active' ||
    sub === 'active' ||
    sub === 'trialing' ||
    profile.paid === true ||
    service === 'activated'
  );
}
