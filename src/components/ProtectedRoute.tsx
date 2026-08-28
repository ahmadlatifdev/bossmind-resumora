import { type ReactNode, useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { useAuth } from '../auth/AuthContext';
import { db } from '../lib/firebase';
import { getLang, t } from '../lib/i18n.js';

type Props = {
  children: ReactNode;
  /** When true, also requires an active subscription claim/Firestore status. */
  requireSubscription?: boolean;
};

/**
 * Gates Video Library (and similar) behind Firebase Auth + optional paid status.
 * Marks service provided when a paid member opens a gated route.
 */
export default function ProtectedRoute({ children, requireSubscription = true }: Props) {
  const { user, loading, subscriptionActive } = useAuth();
  const location = useLocation();
  const lang = getLang();

  useEffect(() => {
    if (!requireSubscription || !user?.uid || !subscriptionActive) return;
    void setDoc(
      doc(db, 'users', user.uid),
      {
        serviceActivated: true,
        serviceProvided: true,
        serviceStatus: 'activated',
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    ).catch(() => {
      /* non-fatal */
    });
  }, [requireSubscription, user?.uid, subscriptionActive]);

  if (loading) {
    return (
      <div className="v6-shell min-h-screen flex items-center justify-center font-sans">
        <p className="opacity-80 tracking-wide">{t(lang, 'auth.checkingAccess')}</p>
      </div>
    );
  }

  if (!user) {
    return (
      <Navigate
        to={`/login?mode=register&from=${encodeURIComponent(location.pathname)}`}
        replace
        state={{ from: location.pathname }}
      />
    );
  }

  if (requireSubscription && !subscriptionActive) {
    return (
      <Navigate
        to="/pricing?paywall=1"
        replace
        state={{ from: location.pathname, reason: 'subscription_required' }}
      />
    );
  }

  return <>{children}</>;
}
