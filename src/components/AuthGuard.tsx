import { type ReactNode } from 'react';
import ProtectedRoute from './ProtectedRoute';

type Props = {
  children: ReactNode;
  requireSubscription?: boolean;
};

/**
 * AuthGuard — alias for ProtectedRoute (login + optional paid plan).
 * Protects premium routes: /video-library, /studio, /resume-studio.
 */
export default function AuthGuard({ children, requireSubscription = true }: Props) {
  return <ProtectedRoute requireSubscription={requireSubscription}>{children}</ProtectedRoute>;
}
