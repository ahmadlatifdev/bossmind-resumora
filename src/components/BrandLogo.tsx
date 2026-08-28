/**
 * Canonical Resumora brand mark — fixed 56×56 on every page/breakpoint.
 * Intrinsic asset is taller than wide; the square box + contain keeps aspect ratio.
 */
import type { CSSProperties } from 'react';

export const BRAND_LOGO_SRC = '/resumora-logo.png';
export const BRAND_LOGO_SIZE = 56;

const LOCKED_SIZE: CSSProperties = {
  width: BRAND_LOGO_SIZE,
  height: BRAND_LOGO_SIZE,
  maxWidth: BRAND_LOGO_SIZE,
  maxHeight: BRAND_LOGO_SIZE,
  objectFit: 'contain',
  objectPosition: 'center',
  display: 'block',
  flexShrink: 0,
};

export default function BrandLogo({ alt = 'Resumora.net', className = '', decorative = false }) {
  return (
    <img
      className={`site-logo__mark ${className}`.trim()}
      src={BRAND_LOGO_SRC}
      alt={decorative ? '' : alt}
      width={BRAND_LOGO_SIZE}
      height={BRAND_LOGO_SIZE}
      style={LOCKED_SIZE}
      decoding="async"
    />
  );
}
