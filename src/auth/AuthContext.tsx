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
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  subscriptionActive: boolean;
  planId: string | null;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  subscriptionActive: false,
  planId: null,
  signOut: async () => {},
});

type SubscriptionState = { active: boolean; planId: string | null };

async function resolveSubscription(user: User): Promise<SubscriptionState> {
  const state: SubscriptionState = { active: false, planId: null };

  try {
    const token = await user.getIdTokenResult(true);
    const claims = token.claims || {};
    if (typeof claims.planId === 'string' && claims.planId) state.planId = claims.planId;
    if (
      claims.subscriptionStatus === 'active' ||
      claims.paid === true ||
      claims.stripeRole === 'subscriber'
    ) {
      state.active = true;
    }
  } catch {
    /* continue to Firestore */
  }

  try {
    const snap = await getDoc(doc(db, 'users', user.uid));
    if (snap.exists()) {
      const data = snap.data() as Record<string, unknown>;
      console.log('AuthContext User Data:', data);
      if (typeof data.planId === 'string' && data.planId) state.planId = data.planId;
      const status = String(data.subscriptionStatus || data.subscription_status || '');
      if (
        data.hasActiveSubscription === true ||
        data.paid === true ||
        status.toLowerCase() === 'active' ||
        data.planId === 'advanced'
      ) {
        state.active = true;
      }
    } else {
      console.log('[AuthContext] no user doc found for', user.uid);
    }
  } catch (err) {
    console.log('[AuthContext] Firestore read failed:', err);
  }

  // Sandbox / test-mode gate: allow any signed-in user when explicitly enabled.
  if (String(import.meta.env.VITE_PAYWALL_ALLOW_AUTHED || '').toLowerCase() === 'true') {
    state.active = true;
  }

  console.log('[AuthContext] resolved subscription:', {
    uid: user.uid,
    active: state.active,
    planId: state.planId,
  });

  return state;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [subscriptionActive, setSubscriptionActive] = useState(false);
  const [planId, setPlanId] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (next) => {
      setLoading(true);
      setUser(next);
      if (!next) {
        setSubscriptionActive(false);
        setPlanId(null);
        setLoading(false);
        return;
      }
      const state = await resolveSubscription(next);
      setSubscriptionActive(state.active);
      setPlanId(state.planId);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const signOut = useCallback(async () => {
    await firebaseSignOut(auth);
  }, []);

  const value = useMemo(
    () => ({ user, loading, subscriptionActive, planId, signOut }),
    [user, loading, subscriptionActive, planId, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
