import Image from "next/image";
import Link from "next/link";
import {
  BRAND_LOGO_ALT,
  BRAND_LOGO_SRC,
  BRAND_LOGO_VARIANTS,
} from "@/lib/marketing/brand-asset-authority.constants";

export type ResumoraLogoVariant = keyof typeof BRAND_LOGO_VARIANTS;

type ResumoraLogoProps = {
  variant?: ResumoraLogoVariant;
  priority?: boolean;
  className?: string;
  /** Wrap in home link (sidebar, topbar, minimal chrome). */
  linkHome?: boolean;
  linkClassName?: string;
  onNavigate?: () => void;
  homeAriaLabel?: string;
};

/**
 * Centralized locked Resumora mark — transparent /brand/resumora-logo-official-transparent.png only.
 */
export default function ResumoraLogo({
  variant = "minimal",
  priority,
  className,
  linkHome = false,
  linkClassName = "",
  onNavigate,
  homeAriaLabel,
}: ResumoraLogoProps) {
  const spec = BRAND_LOGO_VARIANTS[variant] ?? BRAND_LOGO_VARIANTS.minimal;
  const image = (
    <Image
      src={BRAND_LOGO_SRC}
      alt={BRAND_LOGO_ALT}
      width={spec.width}
      height={spec.height}
      priority={priority ?? variant === "sidebar"}
      className={className || spec.className}
      sizes={spec.sizes}
      data-rs-brand-logo="1"
      data-rs-brand-variant={variant}
      data-rs-brand-locked-src={BRAND_LOGO_SRC}
      style={{ objectFit: "contain" }}
    />
  );

  if (!linkHome) return image;

  return (
    <Link
      href="/"
      className={linkClassName || "rs-brand rs-brand--protected"}
      onClick={onNavigate}
      aria-label={homeAriaLabel || BRAND_LOGO_ALT}
    >
      {image}
    </Link>
  );
}
