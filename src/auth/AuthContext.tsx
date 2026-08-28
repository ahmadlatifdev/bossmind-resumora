import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { onAuthStateChanged, signOut as firebaseSignOut, type User } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { isPlanActive, upsertUserProfile } from '../lib/userProfile.js';

export type UserProfile = {
  uid: string;
  email?: string | null;
  fullName?: string | null;
  stripeCustomerId?: string | null;
  plan?: string | null;
  planId?: string | null;
  planStatus?: string | null;
  purchaseDate?: string | null;
  subscriptionStatus?: string | null;
  paid?: boolean;
  [key: string]: unknown;
};

type AuthContextValue = {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  subscriptionActive: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue>({
  user: null,
  profile: null,
  loading: true,
  subscriptionActive: false,
  signOut: async () => {},
  refreshProfile: async () => {},
});

function profileFromSnap(uid: string, data: Record<string, unknown> | undefined): UserProfile {
  return { uid, ...(data || {}) } as UserProfile;
}

/**
 * subscriptionActive is driven primarily by Firestore subscriptionStatus / planStatus.
 * Custom claims and Stripe extension subcollections are secondary signals.
 */
async function resolveSubscriptionActive(
  user: User,
  profile: UserProfile | null
): Promise<boolean> {
  if (isPlanActive(profile)) return true;

  try {
    const token = await user.getIdTokenResult(true);
    const claims = token.claims || {};
    if (
      claims.subscriptionStatus === 'active' ||
      claims.paid === true ||
      claims.stripeRole === 'subscriber' ||
      Boolean(claims.stripeRole)
    ) {
      return true;
    }
  } catch {
    /* continue */
  }

  try {
    const subsQ = query(
      collection(db, 'users', user.uid, 'subscriptions'),
      where('status', 'in', ['active', 'trialing']),
      limit(1)
    );
    const subs = await getDocs(subsQ);
    if (!subs.empty) return true;
  } catch {
    /* treat as inactive */
  }

  if (String(import.meta.env.VITE_PAYWALL_ALLOW_AUTHED || '').toLowerCase() === 'true') {
    return true;
  }

  return false;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [subscriptionActive, setSubscriptionActive] = useState(false);

  const applyProfile = useCallback(async (current: User, nextProfile: UserProfile | null) => {
    setProfile(nextProfile);
    setSubscriptionActive(await resolveSubscriptionActive(current, nextProfile));
  }, []);

  const refreshProfile = useCallback(async () => {
    const current = auth.currentUser;
    if (!current) {
      setProfile(null);
      setSubscriptionActive(false);
      return;
    }
    try {
      const snap = await getDoc(doc(db, 'users', current.uid));
      const nextProfile = snap.exists()
        ? profileFromSnap(current.uid, snap.data() as Record<string, unknown>)
        : null;
      await applyProfile(current, nextProfile);
    } catch {
      setSubscriptionActive(await resolveSubscriptionActive(current, null));
    }
  }, [applyProfile]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (next) => {
      setLoading(true);
      setUser(next);
      if (!next) {
        setProfile(null);
        setSubscriptionActive(false);
        setLoading(false);
        return;
      }
      try {
        await upsertUserProfile(next);
      } catch {
        /* profile create/merge can fail offline; snapshot may still work */
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, []);

  // Live sync: webhook updates users/{uid} → Account shows plan without reload races.
  useEffect(() => {
    if (!user?.uid) return;

    const ref = doc(db, 'users', user.uid);
    const unsub = onSnapshot(
      ref,
      async (snap) => {
        if (!snap.exists()) {
          setProfile(null);
          setSubscriptionActive(await resolveSubscriptionActive(user, null));
          return;
        }
        const nextProfile = profileFromSnap(user.uid, snap.data() as Record<string, unknown>);
        await applyProfile(user, nextProfile);
      },
      async () => {
        setSubscriptionActive(await resolveSubscriptionActive(user, null));
      }
    );
    return () => unsub();
  }, [user, applyProfile]);

  const signOut = useCallback(async () => {
    await firebaseSignOut(auth);
    setProfile(null);
    setSubscriptionActive(false);
  }, []);

  const value = useMemo(
    () => ({
      user,
      profile,
      loading,
      subscriptionActive,
      signOut,
      refreshProfile,
    }),
    [user, profile, loading, subscriptionActive, signOut, refreshProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}

/** Convenience: Firebase user + Firestore profile. */
export function useUser() {
  const { user, profile, loading, subscriptionActive } = useAuth();
  return { user, profile, loading, subscriptionActive };
}
