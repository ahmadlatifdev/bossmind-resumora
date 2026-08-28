import { type ReactNode, useEffect } from 'react';
import { useAuth } from '../auth/AuthContext';
import { getLang, t } from '../lib/i18n.js';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';

type Props = {
  children: ReactNode;
  /** Path to return to after login (standalone HTML entries). */
  loginFrom?: string;
};

/**
 * Auth gate for standalone HTML entries (/studio, /videos) outside react-router.
 * Requires signed-in user with active planStatus / subscription.
 * Marks serviceActivated when the member reaches a premium surface.
 */
export default function StudioAuthGate({ children, loginFrom = '/studio' }: Props) {
  const { user, loading, subscriptionActive } = useAuth();
  const lang = getLang();

  useEffect(() => {
    if (!user?.uid || !subscriptionActive) return;
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
  }, [user?.uid, subscriptionActive]);

  if (loading) {
    return (
      <div className="app-shell">
        <main className="app-main">
          <p className="muted">{t(lang, 'auth.checkingAccess')}</p>
        </main>
      </div>
    );
  }

  if (!user) {
    window.location.replace(`/login?mode=register&from=${encodeURIComponent(loginFrom)}`);
    return null;
  }

  if (!subscriptionActive) {
    window.location.replace('/pricing?paywall=1');
    return null;
  }

  return <>{children}</>;
}
