import type { ReactNode } from 'react';
import SupportChat from './SupportChat';
import SiteFooter from './SiteFooter';

/** Shared chrome for AuthProvider trees — footer + paid-only Support Chat. */
export default function AuthChrome({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <SiteFooter />
      <SupportChat />
    </>
  );
}
