import { useEffect, useMemo } from "react";
import { X } from "lucide-react";
import { getUpgradeOffers, planOfferMeta } from "@/lib/client/studio-plan-upgrades";

const L = (lang, en, fr) => (lang === "fr" ? fr : en);

const MODE_COPY = {
  all: {
    en: { title: "Upgrade your executive studio", sub: "Select an additional service — checkout opens securely without leaving your workspace." },
    fr: { title: "Élevez votre studio executif", sub: "Choisissez un service supplementaire — paiement securise sans quitter votre espace." },
  },
  service: {
    en: { title: "Add another service", sub: "Expand your delivery lanes with a complementary executive package." },
    fr: { title: "Ajouter un autre service", sub: "Étendez vos livrables avec un forfait executif complementaire." },
  },
  executive: {
    en: { title: "Unlock executive package", sub: "Premium interview prep, bilingual assets, and accelerated delivery." },
    fr: { title: "Debloquer le forfait executif", sub: "Preparation entretien premium, livrables bilingues et delai accelere." },
  },
};

export default function StudioUpgradeDrawer({
  open,
  mode = "all",
  lang,
  ownedPlanIds = [],
  busyPlan = "",
  checkoutError = "",
  onClose,
  onSelectPlan,
}) {
  const offers = useMemo(() => getUpgradeOffers(ownedPlanIds, mode).map((p) => planOfferMeta(p, lang)), [ownedPlanIds, mode, lang]);
  const copy = MODE_COPY[mode]?.[lang === "fr" ? "fr" : "en"] || MODE_COPY.all.en;

  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="rs-studio-upgrade-drawer-root" role="presentation">
      <button type="button" className="rs-studio-upgrade-drawer-backdrop" aria-label="Close" onClick={onClose} />
      <aside className="rs-studio-upgrade-drawer" role="dialog" aria-modal="true" aria-labelledby="studio-upgrade-title">
        <header className="rs-studio-upgrade-drawer__head">
          <div>
            <p className="rs-eyebrow">{L(lang, "Executive upgrade center", "Centre de mise a niveau")}</p>
            <h2 id="studio-upgrade-title">{copy.title}</h2>
            <p className="rs-studio-upgrade-drawer__sub">{copy.sub}</p>
          </div>
          <button type="button" className="rs-studio-upgrade-drawer__close" onClick={onClose} aria-label={L(lang, "Close", "Fermer")}>
            <X size={20} strokeWidth={1.75} aria-hidden />
          </button>
        </header>

        {checkoutError ? (
          <p className="rs-studio-upgrade-drawer__error" role="alert">
            {checkoutError}
          </p>
        ) : null}

        <div className="rs-studio-upgrade-drawer__body">
          {offers.length ? (
            <ul className="rs-studio-upgrade-offers">
              {offers.map((offer) => (
                <li key={offer.id} className={`rs-studio-upgrade-offer${offer.featured ? " is-featured" : ""}`}>
                  <div className="rs-studio-upgrade-offer__top">
                    <h3>{offer.name}</h3>
                    <span className="rs-studio-upgrade-offer__price">{offer.price}</span>
                  </div>
                  <p className="rs-studio-upgrade-offer__benefit">{offer.benefit}</p>
                  {offer.revisions ? <p className="rs-studio-upgrade-offer__revs">{offer.revisions}</p> : null}
                  <button
                    type="button"
                    className="rs-btn-accent rs-studio-upgrade-offer__cta"
                    disabled={Boolean(busyPlan)}
                    onClick={() => onSelectPlan(offer.id, offer.name, offer.price.replace(/[^\d]/g, ""))}
                  >
                    {busyPlan === offer.id
                      ? L(lang, "Opening Stripe…", "Ouverture Stripe…")
                      : L(lang, "Activate with Stripe", "Activer avec Stripe")}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rs-studio-upgrade-drawer__empty">
              {L(
                lang,
                "You already hold the available executive packages for this studio lane.",
                "Vous detenez deja les forfaits executifs disponibles pour ce parcours."
              )}
            </p>
          )}
        </div>
      </aside>
    </div>
  );
}
