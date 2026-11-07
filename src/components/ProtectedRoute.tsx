import { type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useLangOptional } from '../i18n/LangContext';
import { t } from '../lib/i18n.js';

type Props = {
  children: ReactNode;
};

/**
 * Gates routes behind Firebase Auth only.
 */
export default function ProtectedRoute({ children }: Props) {
  const { user, loading } = useAuth();
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

  return <>{children}</>;
}
