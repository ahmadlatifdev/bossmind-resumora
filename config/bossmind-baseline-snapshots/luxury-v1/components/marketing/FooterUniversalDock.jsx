import FooterEngagementDock from "@/components/marketing/FooterEngagementDock";
import FooterSocialStrip from "@/components/marketing/FooterSocialStrip";

/** Lowest footer region: official social channels + engagement (all layouts). */
export default function FooterUniversalDock({ variant = "default" }) {
  return (
    <div className={`rs-footer-universal-dock ${variant === "minimal" ? "rs-footer-universal-dock--minimal" : ""}`}>
      <FooterSocialStrip variant={variant} />
      <FooterEngagementDock variant={variant} />
    </div>
  );
}
