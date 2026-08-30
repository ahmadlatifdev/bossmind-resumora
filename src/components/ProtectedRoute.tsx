import { type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useLangOptional } from '../i18n/LangContext';
import { t } from '../lib/i18n.js';

type Props = {
  children: ReactNode;
  /** When true, also requires an active subscription claim/Firestore status. */
  requireSubscription?: boolean;
};

/**
 * Gates Video Library (and similar) behind Firebase Auth + optional paid status.
 */
export default function ProtectedRoute({ children, requireSubscription = true }: Props) {
  const { user, loading, subscriptionActive } = useAuth();
  const { lang } = useLangOptional();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 font-sans">
        <p className="opacity-80 tracking-wide">{t(lang, 'auth.checkingAccess')}</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (requireSubscription && !subscriptionActive) {
    return (
      <Navigate
        to="/?paywall=1"
        replace
        state={{ from: location.pathname, reason: 'subscription_required' }}
      />
    );
  }

  return <>{children}</>;
}
