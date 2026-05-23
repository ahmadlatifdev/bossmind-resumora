import { ArrowUpRight, Layers, Sparkles } from "lucide-react";
import { hasUpgradeOffers } from "@/lib/client/studio-plan-upgrades";

const L = (lang, en, fr) => (lang === "fr" ? fr : en);

export default function StudioUpgradeControls({ lang, ownedPlanIds = [], onOpen, compact = false }) {
  const canUpgrade = hasUpgradeOffers(ownedPlanIds, "all");
  const canExecutive = hasUpgradeOffers(ownedPlanIds, "executive");
  const canService = hasUpgradeOffers(ownedPlanIds, "service");

  if (!canUpgrade && !canExecutive && !canService) return null;

  const btnClass = compact ? "rs-studio-upgrade-btn rs-studio-upgrade-btn--compact" : "rs-studio-upgrade-btn";

  return (
    <div className={`rs-studio-upgrade-controls${compact ? " rs-studio-upgrade-controls--compact" : ""}`} role="group">
      {canUpgrade ? (
        <button type="button" className={`${btnClass} rs-studio-upgrade-btn--primary`} onClick={() => onOpen("all")}>
          <ArrowUpRight size={14} strokeWidth={2} aria-hidden />
          {L(lang, "Upgrade Plan", "Mettre a niveau")}
        </button>
      ) : null}
      {canService ? (
        <button type="button" className={btnClass} onClick={() => onOpen("service")}>
          <Layers size={14} strokeWidth={2} aria-hidden />
          {compact ? L(lang, "Add Service", "Ajouter") : L(lang, "Add Another Service", "Ajouter un service")}
        </button>
      ) : null}
      {canExecutive ? (
        <button type="button" className={btnClass} onClick={() => onOpen("executive")}>
          <Sparkles size={14} strokeWidth={2} aria-hidden />
          {compact ? L(lang, "Executive", "Executif") : L(lang, "Unlock Executive Package", "Forfait executif")}
        </button>
      ) : null}
    </div>
  );
}
