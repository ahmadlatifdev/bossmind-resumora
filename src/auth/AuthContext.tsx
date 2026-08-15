import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  subscriptionActive: boolean;
};

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  subscriptionActive: false,
});

async function resolveSubscriptionActive(user: User): Promise<boolean> {
  try {
    const token = await user.getIdTokenResult(true);
    const claims = token.claims || {};
    if (
      claims.subscriptionStatus === 'active' ||
      claims.paid === true ||
      claims.stripeRole === 'subscriber'
    ) {
      return true;
    }
  } catch {
    /* continue to Firestore */
  }

  try {
    const snap = await getDoc(doc(db, 'users', user.uid));
    if (snap.exists()) {
      const data = snap.data() as Record<string, unknown>;
      const status = String(data.subscriptionStatus || data.subscription_status || '');
      if (status.toLowerCase() === 'active') return true;
      if (data.paid === true || data.hasActiveSubscription === true) return true;
    }
  } catch {
    /* treat as inactive */
  }

  // Sandbox / test-mode gate: allow any signed-in user when explicitly enabled.
  if (String(import.meta.env.VITE_PAYWALL_ALLOW_AUTHED || '').toLowerCase() === 'true') {
    return true;
  }

  return false;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [subscriptionActive, setSubscriptionActive] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (next) => {
      setLoading(true);
      setUser(next);
      if (!next) {
        setSubscriptionActive(false);
        setLoading(false);
        return;
      }
      const active = await resolveSubscriptionActive(next);
      setSubscriptionActive(active);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const value = useMemo(
    () => ({ user, loading, subscriptionActive }),
    [user, loading, subscriptionActive]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
