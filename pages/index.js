import { useId, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  ClipboardPenLine,
  Crown,
  FileText,
  Headphones,
  Languages,
  Menu,
  Mic2,
  PenLine,
  Shield,
  X,
  BriefcaseBusiness,
} from "lucide-react";

const translations = {
  en: {
    navTrust: "Trust",
    navServices: "Services",
    navPricing: "Pricing",
    navProcess: "Process",
    navCountries: "Regions",
    navTestimonials: "Stories",
    navContact: "Contact",
    navLogin: "Login",
    navRegister: "Register",
    openMenu: "Open menu",
    closeMenu: "Close menu",
    heroKicker: "Executive resume studio · 2026",
    heroHeadline: "Resumes engineered for credible shortlists—in any market.",
    heroSubtitle:
      "Premium ATS architecture, recruiter-grade narration, and white-glove delivery. Built for Fortune pipelines, hyperscale tech, and cross-border mandates—without synthetic filler.",
    heroPrimary: "View plans",
    heroSecondary: "Upload resume",
    heroPanelTitle: "Readiness diagnostic",
    heroPanelSubtitle: "What specialists optimise first",
    heroLine1: "Keyword architecture parsers respect",
    heroLine2: "Skim-optimised hierarchy for humans",
    heroLine3: "Executive tone calibrated to mandate",
    trustTitle: "Operating metrics sponsors expect",
    trustSubtitle:
      "Consistency you can cite in stakeholder updates—delivery cadence, satisfaction, and scale.",
    trustStrip: "Greenhouse · Lever · Workday · ATS-safe PDF/DOC · Global hiring desks · EN/FR delivery",
    uploadTitle: "Secure intake",
    uploadText:
      "Encrypted upload for a strategist audit—ATS alignment, scanability, and leadership narrative clarity before prescribing your tier.",
    uploadButton: "Upload document",
    uploadSuccess: "Upload completed successfully.",
    uploadError: "Upload failed. Please try again.",
    uploadHint: "Accepted: PDF, DOC, DOCX · Max sensible executive length.",
    servicesTitle: "Curated capabilities",
    servicesSubtitle:
      "Discrete modules you can compose—each anchored to recruiter behaviour and ATS vendors in market.",
    serviceAction: "Continue",
    serviceCategory: "Line of business",
    pricingTitle: "Transparent pricing",
    pricingSubtitle: "Increasing depth, revision allocation, and senior oversight—pricing unchanged across regions.",
    popular: "Most selected",
    selectPlan: "Select plan",
    processing: "Processing…",
    processTitle: "Delivery protocol",
    processSubtitle:
      "A repeatable, audit-friendly workflow—from encrypted intake to ATS-safe export.",
    countriesTitle: "Regional resume conventions",
    countriesSubtitle:
      "Page norms and tonal registers tuned per jurisdiction. Plans and checkout remain USD-consistent worldwide.",
    testimonialsTitle: "Client outcomes",
    testimonialsSubtitle:
      "Selected feedback from executives and senior ICs after repositioning engagements.",
    ctaTitle: "Reserve your delivery window",
    ctaSubtitle:
      "Professional and Elite unlock same-week strategist blocks when capacity allows.",
    ctaPrimary: "Choose a plan",
    ctaSecondary: "Contact concierge",
    footerTagline:
      "Resumora crafts institutional-grade career collateral for leaders who cannot afford generic.",
    footerColProduct: "Product",
    footerColCompany: "Company",
    footerColLegal: "Legal",
    footerAbout: "About",
    footerServices: "Services",
    footerPricing: "Pricing",
    footerUpload: "Upload",
    footerTrust: "Trust metrics",
    footerProcess: "Process",
    footerRegions: "Regions",
    footerStories: "Stories",
    footerTerms: "Terms",
    footerPrivacy: "Privacy",
    footerSupport: "Support",
    footerContact: "Contact",
    footerCopy: "© 2026 Resumora. All rights reserved.",
  },
  fr: {
    navTrust: "Confiance",
    navServices: "Services",
    navPricing: "Tarifs",
    navProcess: "Processus",
    navCountries: "Régions",
    navTestimonials: "Récits",
    navContact: "Contact",
    navLogin: "Connexion",
    navRegister: "Inscription",
    openMenu: "Ouvrir le menu",
    closeMenu: "Fermer le menu",
    heroKicker: "Studio CV exécutif · 2026",
    heroHeadline: "Des CV conçus pour des shortlists crédibles—partout.",
    heroSubtitle:
      "Architecture ATS premium, narration niveau recruteur et livraison clé en main. Pour viviers Fortune, tech hyperscale et mandats transfrontaliers—sans remplissage artificiel.",
    heroPrimary: "Voir les plans",
    heroSecondary: "Téléverser le CV",
    heroPanelTitle: "Diagnostic de maturité",
    heroPanelSubtitle: "Ce que nos spécialistes optimisent en premier",
    heroLine1: "Mots-clés que les parseurs retiennent",
    heroLine2: "Hiérarchie lisible en diagonal humain",
    heroLine3: "Ton direction calibré au mandat",
    trustTitle: "Indicateurs attendus en comité",
    trustSubtitle:
      "Des références opérationnelles—cadence, satisfaction et ampleur—pas des tableaux décoratifs.",
    trustStrip:
      "Greenhouse · Lever · Workday · PDF/DOC compatibles ATS · Recrutement global · Livrables EN/FR",
    uploadTitle: "Réception sécurisée",
    uploadText:
      "Téléversement chiffré pour audit stratège—alignement ATS, lisibilité et clarté de narration avant recommandation de palier.",
    uploadButton: "Téléverser le document",
    uploadSuccess: "Téléversement terminé avec succès.",
    uploadError: "Échec du téléversement. Veuillez réessayer.",
    uploadHint: "Formats : PDF, DOC, DOCX · Longueur exécutive raisonnable.",
    servicesTitle: "Capacités structurées",
    servicesSubtitle:
      "Modules distincts à composer—ancrés sur le comportement recruteur et les ATS du marché.",
    serviceAction: "Poursuivre",
    serviceCategory: "Périmètre",
    pricingTitle: "Tarification transparente",
    pricingSubtitle:
      "Profondeur, volume de révisions et supervision senior progressifs—prix USD stable quelle que soit la région.",
    popular: "Le plus choisi",
    selectPlan: "Sélectionner le plan",
    processing: "Traitement…",
    processTitle: "Protocole de livraison",
    processSubtitle:
      "Un flux reproductible et auditable—de l’intake chiffré à l’export compatible ATS.",
    countriesTitle: "Conventions par pays",
    countriesSubtitle:
      "Longueurs de page et registres de ton par juridiction. Tarification et passage en caisse inchangés mondialement.",
    testimonialsTitle: "Résultats clients",
    testimonialsSubtitle:
      "Retours d’exécutifs et profils seniors après missions de repositionnement.",
    ctaTitle: "Réservez votre créneau de livraison",
    ctaSubtitle:
      "Professionnel et Élite ouvrent des blocs stratèges sous la même semaine selon capacité.",
    ctaPrimary: "Choisir un plan",
    ctaSecondary: "Contacter le concierge",
    footerTagline:
      "Resumora produit des dossiers carrière de niveau institutionnel pour les leaders qui refusent le générique.",
    footerColProduct: "Produit",
    footerColCompany: "Entreprise",
    footerColLegal: "Juridique",
    footerAbout: "À propos",
    footerServices: "Services",
    footerPricing: "Tarifs",
    footerUpload: "Téléversement",
    footerTrust: "Indicateurs",
    footerProcess: "Processus",
    footerRegions: "Régions",
    footerStories: "Récits",
    footerTerms: "Conditions",
    footerPrivacy: "Confidentialité",
    footerSupport: "Support",
    footerContact: "Contact",
    footerCopy: "© 2026 Resumora. Tous droits réservés.",
  },
};

function processSteps(lang) {
  return lang === "en"
    ? [
        {
          title: "Secure upload",
          detail: "Encrypted intake, role classification, and scope lock.",
          step: "01",
          Icon: FileText,
        },
        {
          title: "ATS + human audit",
          detail: "Parser logic crossed with recruiter skim heuristics.",
          step: "02",
          Icon: Shield,
        },
        {
          title: "Executive rewrite",
          detail: "Structure, KPI density, and leadership tone rebuilt.",
          step: "03",
          Icon: ClipboardPenLine,
        },
        {
          title: "Polish & release",
          detail: "ATS-safe layout validation and final artefact handoff.",
          step: "04",
          Icon: CheckCircle2,
        },
      ]
    : [
        {
          title: "Téléversement sécurisé",
          detail: "Réception chiffrée, qualification du poste et périmètre figé.",
          step: "01",
          Icon: FileText,
        },
        {
          title: "Audit ATS + humain",
          detail: "Parseur croisé avec heuristiques de lecture recruteur.",
          step: "02",
          Icon: Shield,
        },
        {
          title: "Réécriture exécutive",
          detail: "Structure, densité KPI et ton de direction reconstruits.",
          step: "03",
          Icon: ClipboardPenLine,
        },
        {
          title: "Finitions & remise",
          detail: "Validation mise en page ATS-safe et livraison finale.",
          step: "04",
          Icon: CheckCircle2,
        },
      ];
}

function testimonials(lang) {
  return lang === "en"
    ? [
        {
          quote:
            "They reframed my mandate without diluting my voice. Quality callbacks inside two weeks.",
          author: "Morgan L.",
          role: "Director of Product, Fintech",
        },
        {
          quote: "Finally, ATS pass-through matched how strong my operating record actually reads.",
          author: "James K.",
          role: "VP Engineering",
        },
        {
          quote: "Bilingual EN/FR packs unlocked Paris and Montréal searches with one coherent narrative.",
          author: "Amélie R.",
          role: "Strategy Lead",
        },
      ]
    : [
        {
          quote:
            "Ils ont recadré mon mandat sans diluer ma voix. Retours qualité en moins de deux semaines.",
          author: "Morgan L.",
          role: "Directrice produit, fintech",
        },
        {
          quote: "Enfin un passage ATS à la hauteur de mon historique opérationnel réel.",
          author: "James K.",
          role: "VP ingénierie",
        },
        {
          quote: "Les livrables bilingues EN/FR ont débloqué Paris et Montréal avec une narration unique.",
          author: "Amélie R.",
          role: "Lead stratégie",
        },
      ];
}

const services = {
  en: [
    {
      category: "Resume strategy",
      title: "ATS resume optimisation",
      description:
        "Full-spectrum rewrite with lexical precision, parser-safe layout, and section flow proven across major ATS vendors.",
      ctaHref: "#upload",
      ctaLabel: "Upload for review",
      Icon: FileText,
    },
    {
      category: "Application assets",
      title: "Strategic cover letter",
      description:
        "Narratives tied to mandate, culture cues, and quantified proof so submissions feel bespoke at scale.",
      ctaHref: "#upload",
      ctaLabel: "Start with intake",
      Icon: PenLine,
    },
    {
      category: "Personal brand",
      title: "LinkedIn repositioning",
      description:
        "Authority-forward headline, featured media, and discoverability calibrated to recruiter search norms.",
      ctaHref: "#pricing",
      ctaLabel: "Select tier",
      Icon: BriefcaseBusiness,
    },
    {
      category: "Interview readiness",
      title: "Interview preparation",
      description:
        "Scenario drills and executive presence aligned to your reconstructed dossier—not generic scripts.",
      ctaHref: "#pricing",
      ctaLabel: "Book preparation",
      Icon: Mic2,
    },
    {
      category: "Localisation",
      title: "Translation / TLS",
      description:
        "Native-grade EN/FR pairs with tonal harmonisation across resume, outreach, and follow-up artefacts.",
      ctaHref: "#countries",
      ctaLabel: "Regional standards",
      Icon: Languages,
    },
    {
      category: "Concierge",
      title: "Priority support",
      description:
        "Concierge pacing, explicit SLAs, and direct escalation whenever velocity is non-negotiable.",
      ctaHref: "#pricing",
      ctaLabel: "Upgrade tier",
      Icon: Headphones,
    },
  ],
  fr: [
    {
      category: "Stratégie CV",
      title: "Optimisation CV ATS",
      description:
        "Réécriture complète, mise en page parseur-safe et enchaînement de sections éprouvé chez les grands ATS.",
      ctaHref: "#upload",
      ctaLabel: "Téléverser pour audit",
      Icon: FileText,
    },
    {
      category: "Dossiers candidature",
      title: "Lettre stratégique",
      description:
        "Narratifs reliés au mandat, signaux culture et preuves chiffrées pour un rendu sur-mesure industriel.",
      ctaHref: "#upload",
      ctaLabel: "Par l’intake",
      Icon: PenLine,
    },
    {
      category: "Marque personnelle",
      title: "Relance LinkedIn",
      description:
        "Titre d’autorité, médias vedettes et découvrabilité calibrées aux usages de recherche recruteur.",
      ctaHref: "#pricing",
      ctaLabel: "Choisir le palier",
      Icon: BriefcaseBusiness,
    },
    {
      category: "Entretien",
      title: "Préparation entretien",
      description:
        "Drills situationnels et présence cadre synchronisés sur votre dossier reconstruit—pas de scripts génériques.",
      ctaHref: "#pricing",
      ctaLabel: "Réserver",
      Icon: Mic2,
    },
    {
      category: "Localisation",
      title: "Traduction / TLS",
      description:
        "Paires EN/FR niveau native avec harmonisation sur tous les artefacts de poursuite.",
      ctaHref: "#countries",
      ctaLabel: "Standards régionaux",
      Icon: Languages,
    },
    {
      category: "Conciergerie",
      title: "Support prioritaire",
      description:
        "Rythme concierge, SLA explicites et remontée directe lorsque la vitesse est critique.",
      ctaHref: "#pricing",
      ctaLabel: "Monter de palier",
      Icon: Headphones,
    },
  ],
};

const pricingPlans = [
  {
    id: "basic",
    name: { en: "Basic", fr: "Basic" },
    price: "$19",
    env: "NEXT_PUBLIC_STRIPE_PRICE_STARTER",
    featured: false,
    features: {
      en: [
        "Deep ATS remediation pass",
        "Typography + hierarchy upgrade",
        "Industry keyword scaffolding",
        "1 free edit included",
        "One structured revision sprint",
      ],
      fr: [
        "Remédiation ATS approfondie",
        "Hiérarchie typographique premium",
        "Échafaudage mots-clés secteur",
        "1 modification gratuite incluse",
        "Une sprint révision guidée",
      ],
    },
  },
  {
    id: "professional",
    name: { en: "Professional", fr: "Professionnel" },
    price: "$49",
    env: "NEXT_PUBLIC_STRIPE_PRICE_PRO",
    featured: true,
    features: {
      en: [
        "Everything inside Basic",
        "Full chronological or hybrid rebuild",
        "Role-specific accomplishment mining",
        "2 free edits included",
        "Cover letter authored to spec",
      ],
      fr: [
        "Toutes les garanties Basic",
        "Rebuild chronologique ou hybride",
        "Mining de réalisations cible métier",
        "2 modifications gratuites incluses",
        "Lettre sur-mesure signée strategist",
      ],
    },
  },
  {
    id: "elite",
    name: { en: "Elite", fr: "Élite" },
    price: "$99",
    env: "NEXT_PUBLIC_STRIPE_PRICE_ELITE",
    featured: false,
    features: {
      en: [
        "Professional depth + LinkedIn relaunch",
        "Executive storyline workshop",
        "Recorded interview rehearsals",
        "3 free edits included",
        "Dedicated concierge strategist",
      ],
      fr: [
        "Profondeur Professionnel + LinkedIn relancé",
        "Atelier storyline direction",
        "Répétitions entretien enregistrées",
        "3 modifications gratuites incluses",
        "Stratège concierge attitré",
      ],
    },
  },
];

const performanceStats = {
  en: [
    { value: "98.2%", label: "Client satisfaction", detail: "Measured post-delivery across premium tiers." },
    { value: "4.7×", label: "Interview lift", detail: "Median uplift after completed repositioning." },
    { value: "34h", label: "Median fulfilment", detail: "Operational cadence benchmarked quarterly." },
    { value: "16k+", label: "Professionals served", detail: "From senior IC through EVP mandates." },
  ],
  fr: [
    { value: "98,2 %", label: "Satisfaction client", detail: "Mesurée après livraison sur paliers premium." },
    { value: "4,7×", label: "Lift entretiens", detail: "Hausse médiane après repositionnement mené à terme." },
    { value: "34h", label: "Délai médian", detail: "Cadence opérationnelle revue trimestriellement." },
    { value: "16k+", label: "Profils accompagnés", detail: "Des profils seniors IC aux mandats VP/EVP." },
  ],
};

const countries = {
  en: [
    {
      country: "Canada",
      standard: "1–2 pages standard",
      line: "Federal and bilingual hiring corridors; ATS layouts tuned for bilingual screening; tone for Toronto, Vancouver, and pan-Canadian mandates.",
    },
    {
      country: "United States",
      standard: "1 page preferred · 2 for senior operators",
      line: "Outcome-heavy narratives for hyperscale tech, finance, and consulting—keyword depth for Greenhouse, Lever, and Workday-heavy stacks.",
    },
    {
      country: "United Kingdom",
      standard: "2 pages standard",
      line: "Competency scaffolding for regulated professions—proof stacks aligned to recruiter skim rhythms across London and regional hubs.",
    },
    {
      country: "France",
      standard: "1–2 pages standard",
      line: "Executive French register with Anglo crossover fluency—for CAC groups, boutiques, and Paris ↔ global HQ mobility.",
    },
    {
      country: "UAE",
      standard: "2 pages standard",
      line: "Board-adjacent narratives across sovereign-backed initiatives, aviation, logistics, finance, and luxury in Dubai and Abu Dhabi lanes.",
    },
    {
      country: "Germany",
      standard: "1–2 pages standard",
      line: "Precision KPI layering for Mittelstand and DAX narratives—readable for deeply technical hiring panels.",
    },
    {
      country: "Singapore",
      standard: "1–2 pages standard",
      line: "APAC finance and technology benchmarks with crisp quantification for regional HQs anchoring ASEAN liquidity centres.",
    },
    {
      country: "Australia",
      standard: "2 pages standard",
      line: "Direct proof architecture tuned to pragmatic hiring cultures—scope, EBITDA impact, and team scale foregrounded.",
    },
  ],
  fr: [
    {
      country: "Canada",
      standard: "Norme 1–2 pages",
      line: "Viviers fédéraux et bilingues; mise en page ATS adaptée au filtrage bilingue; ton direction pour hubs stratégiques nationaux.",
    },
    {
      country: "États-Unis",
      standard: "1 page visée · 2 pour profils seniors",
      line: "Narratifs résultats pour tech hyperscale et finance—profondeur mots-clés compatible stacks Greenhouse, Lever et Workday.",
    },
    {
      country: "Royaume-Uni",
      standard: "Norme 2 pages",
      line: "Structuration par compétences pour secteurs réglementés—preuves concises lisibles pour recruteurs londoniens.",
    },
    {
      country: "France",
      standard: "Norme 1–2 pages",
      line: "Registre exécutif français avec pivot anglais fluide—groupes cotés Paris et mobilités internationales.",
    },
    {
      country: "EAU",
      standard: "Norme 2 pages",
      line: "Récits niveau CODIR pour finance souveraine, aviation, supply chain et luxe sur corridors Dubaï / Abou Dabi.",
    },
    {
      country: "Allemagne",
      standard: "Norme 1–2 pages",
      line: "Couches KPI précises Mittelstand / DAX—claires pour jurys techniques exigeants.",
    },
    {
      country: "Singapour",
      standard: "Norme 1–2 pages",
      line: "Standards finance & tech APAC avec quantification nette pour sièges régionnels ASEAN.",
    },
    {
      country: "Australie",
      standard: "Norme 2 pages",
      line: "Architectures de preuve directes pour marchés où la franchise opérationnelle prime.",
    },
  ],
};

export default function HomePage() {
  const [lang, setLang] = useState("en");
  const [uploadStatus, setUploadStatus] = useState("");
  const [busyPlan, setBusyPlan] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const uploadFieldId = useId();

  const t = translations[lang];
  const steps = processSteps(lang);
  const quotes = testimonials(lang);
  const stats = performanceStats[lang];

  const dynamicPlans = useMemo(
    () =>
      pricingPlans.map((plan) => ({
        ...plan,
        priceId: process.env[plan.env] || "",
      })),
    []
  );

  const handleCheckout = async (priceId, planId, planName, planPrice) => {
    if (!priceId) {
      alert("Missing Stripe price ID configuration for this plan.");
      return;
    }
    setBusyPlan(planId);
    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId, planId, planName, planPrice }),
      });
      const data = await response.json();
      if (!response.ok || !data.id) {
        throw new Error(data.error || "Checkout failed");
      }
      const stripePublicKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
      if (!stripePublicKey) {
        throw new Error("Missing NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY");
      }
      const stripeLib = await import("@stripe/stripe-js");
      const stripe = await stripeLib.loadStripe(stripePublicKey);
      if (!stripe) {
        throw new Error("Could not initialize Stripe");
      }
      const { error } = await stripe.redirectToCheckout({ sessionId: data.id });
      if (error) throw error;
    } catch (error) {
      alert(error.message || "Unable to start checkout.");
    } finally {
      setBusyPlan("");
    }
  };

  const handleUpload = async (event) => {
    event.preventDefault();
    setUploadStatus("");
    const fileInput = event.currentTarget.elements.resumeFile;
    const file = fileInput?.files?.[0];
    if (!file) {
      setUploadStatus(t.uploadError);
      return;
    }

    try {
      const data = new FormData();
      data.append("resumeFile", file);
      const response = await fetch("/api/upload-resume", {
        method: "POST",
        body: data,
      });
      if (!response.ok) throw new Error("Upload failed");
      setUploadStatus(t.uploadSuccess);
      event.currentTarget.reset();
    } catch {
      setUploadStatus(t.uploadError);
    }
  };

  const closeMenu = () => setMenuOpen(false);

  const navLinks = (
    <>
      <a href="#trust" onClick={closeMenu}>
        {t.navTrust}
      </a>
      <a href="#services" onClick={closeMenu}>
        {t.navServices}
      </a>
      <a href="#pricing" onClick={closeMenu}>
        {t.navPricing}
      </a>
      <a href="#process" onClick={closeMenu}>
        {t.navProcess}
      </a>
      <a href="#countries" onClick={closeMenu}>
        {t.navCountries}
      </a>
      <a href="#testimonials" onClick={closeMenu}>
        {t.navTestimonials}
      </a>
      <Link href="/contact" onClick={closeMenu}>
        {t.navContact}
      </Link>
    </>
  );

  return (
    <div className="rs-page">
      <div className="rs-bg" aria-hidden />

      <header className="rs-header">
        <div className="rs-header-inner">
          <Link href="/#top" className="rs-brand" aria-label="Resumora home">
            <Image
              src="/resumora-logo.png"
              alt="Resumora"
              width={210}
              height={48}
              priority
              className="rs-logo"
              sizes="210px"
            />
          </Link>

          <nav className="rs-nav-desktop" aria-label="Primary">
            {navLinks}
          </nav>

          <div className="rs-header-actions">
            <button
              type="button"
              className="rs-lang"
              data-active={lang === "en"}
              onClick={() => setLang("en")}
              aria-pressed={lang === "en"}
            >
              EN
            </button>
            <button
              type="button"
              className="rs-lang"
              data-active={lang === "fr"}
              onClick={() => setLang("fr")}
              aria-pressed={lang === "fr"}
            >
              FR
            </button>
            <Link href="/login" className="rs-btn-ghost rs-hide-tablet-auth">
              {t.navLogin}
            </Link>
            <Link href="/register" className="rs-btn-accent rs-hide-tablet-auth">
              {t.navRegister}
            </Link>
            <button
              type="button"
              className="rs-menu-toggle hide-lg"
              onClick={() => setMenuOpen((v) => !v)}
              aria-expanded={menuOpen}
              aria-label={menuOpen ? t.closeMenu : t.openMenu}
            >
              {menuOpen ? <X className="rs-icon-gold" size={22} strokeWidth={1.5} /> : <Menu className="rs-icon-gold" size={22} strokeWidth={1.5} />}
            </button>
          </div>
        </div>

        <div className="rs-mobile-panel" data-open={menuOpen ? "true" : "false"}>
          <nav aria-label="Mobile primary">{navLinks}</nav>
          <div className="rs-mobile-actions">
            <Link href="/login" className="rs-btn-ghost" onClick={closeMenu}>
              {t.navLogin}
            </Link>
            <Link href="/register" className="rs-btn-accent" onClick={closeMenu}>
              {t.navRegister}
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section id="top" className="rs-section">
          <div className="rs-container">
            <div className="rs-hero-grid">
              <div>
                <p className="rs-eyebrow" style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  <Crown size={14} strokeWidth={1.5} className="rs-icon-gold" aria-hidden />
                  {t.heroKicker}
                </p>
                <h1 className="rs-h1">{t.heroHeadline}</h1>
                <p className="rs-lead">{t.heroSubtitle}</p>
                <div className="rs-hero-ctas">
                  <a href="#pricing" className="rs-btn-accent">
                    {t.heroPrimary}
                  </a>
                  <a href="#upload" className="rs-btn-ghost">
                    {t.heroSecondary}
                  </a>
                </div>
              </div>
              <aside className="rs-hero-preview" aria-label={t.heroPanelTitle}>
                <div className="rs-preview-row">{t.heroPanelTitle}</div>
                <p style={{ margin: 0, fontSize: "0.9375rem", color: "var(--rs-text-secondary)" }}>{t.heroPanelSubtitle}</p>
                <ul style={{ listStyle: "none", margin: "1rem 0 0", padding: 0, display: "grid", gap: "0.65rem" }}>
                  {[t.heroLine1, t.heroLine2, t.heroLine3].map((line) => (
                    <li key={line} style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem", fontSize: "0.9rem", color: "var(--rs-text-secondary)" }}>
                      <CheckCircle2 size={18} strokeWidth={1.5} className="rs-icon-gold" style={{ marginTop: "0.15rem" }} aria-hidden />
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
                <div style={{ marginTop: "1.25rem", paddingTop: "1rem", borderTop: "1px solid var(--rs-border)" }}>
                  <div className="rs-preview-row">{lang === "en" ? "Document score trajectory" : "Trajectoire de score dossier"}</div>
                  <div className="rs-preview-meter" aria-hidden>
                    <span />
                  </div>
                </div>
              </aside>
            </div>
          </div>
        </section>

        <section id="trust" className="rs-section rs-section-muted">
          <div className="rs-container">
            <p className="rs-eyebrow">{t.navTrust}</p>
            <h2 className="rs-h2">{t.trustTitle}</h2>
            <p className="rs-subtitle">{t.trustSubtitle}</p>
            <div className="rs-trust-grid">
              {stats.map((s) => (
                <article key={s.label} className="rs-stat-card">
                  <div className="rs-stat-value">{s.value}</div>
                  <div className="rs-stat-label">{s.label}</div>
                  <p className="rs-stat-detail">{s.detail}</p>
                </article>
              ))}
            </div>
            <p className="rs-trust-strip">{t.trustStrip}</p>
          </div>
        </section>

        <section id="services" className="rs-section">
          <div className="rs-container">
            <p className="rs-eyebrow">{t.navServices}</p>
            <h2 className="rs-h2">{t.servicesTitle}</h2>
            <p className="rs-subtitle">{t.servicesSubtitle}</p>
            <div className="rs-card-grid">
              {services[lang].map((item) => {
                const I = item.Icon;
                return (
                  <article key={item.title} className="rs-service-card">
                    <span className="rs-cat-pill">
                      {t.serviceCategory}: {item.category}
                    </span>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <I size={22} strokeWidth={1.45} className="rs-icon-gold" aria-hidden />
                      <h3>{item.title}</h3>
                    </div>
                    <p>{item.description}</p>
                    <Link href={item.ctaHref} className="rs-card-cta">
                      {item.ctaLabel}
                      <ArrowRight size={14} aria-hidden />
                    </Link>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section id="upload" className="rs-section rs-section-muted">
          <div className="rs-container">
            <p className="rs-eyebrow">{t.footerUpload}</p>
            <h2 className="rs-h2">{t.uploadTitle}</h2>
            <p className="rs-subtitle">{t.uploadText}</p>
            <div className="rs-upload-panel">
              <form onSubmit={handleUpload} style={{ display: "grid", gap: "0.75rem" }}>
                <label htmlFor={uploadFieldId} className="sr-only">
                  Resume file
                </label>
                <input id={uploadFieldId} className="rs-file-input" type="file" name="resumeFile" accept=".pdf,.doc,.docx,application/pdf" required />
                <button type="submit" className="rs-btn-accent" style={{ justifySelf: "start" }}>
                  {t.uploadButton}
                </button>
                {uploadStatus ? (
                  <p
                    className="rs-upload-status"
                    data-state={uploadStatus === t.uploadSuccess ? "ok" : "err"}
                    role="status"
                  >
                    {uploadStatus}
                  </p>
                ) : null}
              </form>
              <div>
                <p style={{ margin: 0, fontSize: "0.9375rem", lineHeight: 1.7, color: "var(--rs-text-secondary)" }}>{t.uploadHint}</p>
                <Link href="/register" className="rs-card-cta" style={{ marginTop: "1rem" }}>
                  {t.navRegister}
                  <ArrowRight size={14} aria-hidden />
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section id="pricing" className="rs-section">
          <div className="rs-container">
            <p className="rs-eyebrow">{t.navPricing}</p>
            <h2 className="rs-h2">{t.pricingTitle}</h2>
            <p className="rs-subtitle">{t.pricingSubtitle}</p>
            <div className="rs-pricing-grid">
              {dynamicPlans.map((plan) => (
                <article key={plan.id} className="rs-price-card" data-featured={plan.featured}>
                  {plan.featured ? <span className="rs-price-flag">{t.popular}</span> : null}
                  <div>
                    <h3 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 800 }}>{plan.name[lang]}</h3>
                    <div className="rs-price-amount" style={{ marginTop: "0.35rem" }}>
                      {plan.price}
                      <span style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--rs-text-muted)" }}>
                        {" "}
                        · {lang === "en" ? "one-time" : "paiement unique"}
                      </span>
                    </div>
                  </div>
                  <ul className="rs-price-features">
                    {plan.features[lang].map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    className="rs-price-btn"
                    disabled={busyPlan === plan.id}
                    onClick={() =>
                      handleCheckout(plan.priceId, plan.id, plan.name[lang], plan.price.replace(/[^\d]/g, ""))
                    }
                  >
                    {busyPlan === plan.id ? t.processing : t.selectPlan}
                  </button>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="process" className="rs-section rs-section-muted">
          <div className="rs-container">
            <p className="rs-eyebrow">{t.navProcess}</p>
            <h2 className="rs-h2">{t.processTitle}</h2>
            <p className="rs-subtitle">{t.processSubtitle}</p>
            <div className="rs-process-steps">
              {steps.map((s) => {
                const I = s.Icon;
                return (
                  <article key={s.step} className="rs-step">
                    <div className="rs-step-num">{s.step}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", marginTop: "0.5rem" }}>
                      <I size={20} strokeWidth={1.45} className="rs-icon-gold" aria-hidden />
                      <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 800 }}>{s.title}</h3>
                    </div>
                    <p style={{ margin: "0.55rem 0 0", fontSize: "0.875rem", lineHeight: 1.65, color: "var(--rs-text-secondary)" }}>{s.detail}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section id="countries" className="rs-section">
          <div className="rs-container">
            <p className="rs-eyebrow">{t.navCountries}</p>
            <h2 className="rs-h2">{t.countriesTitle}</h2>
            <p className="rs-subtitle">{t.countriesSubtitle}</p>
            <div className="rs-region-grid">
              {countries[lang].map((c) => (
                <article key={c.country} className="rs-region-card">
                  <div className="rs-region-name">{c.country}</div>
                  <div className="rs-region-standard">{c.standard}</div>
                  <p className="rs-region-desc">{c.line}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="testimonials" className="rs-section rs-section-muted">
          <div className="rs-container">
            <p className="rs-eyebrow">{t.navTestimonials}</p>
            <h2 className="rs-h2">{t.testimonialsTitle}</h2>
            <p className="rs-subtitle">{t.testimonialsSubtitle}</p>
            <div className="rs-card-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
              {quotes.map((q) => (
                <blockquote key={q.author} className="rs-quote-card">
                  <p className="rs-quote">&ldquo;{q.quote}&rdquo;</p>
                  <footer className="rs-quote-author">
                    {q.author}
                    <span style={{ display: "block", fontWeight: 500, color: "var(--rs-text-muted)", marginTop: "0.2rem" }}>{q.role}</span>
                  </footer>
                </blockquote>
              ))}
            </div>
          </div>
        </section>

        <section id="cta" className="rs-section">
          <div className="rs-container">
            <div className="rs-cta-strip">
              <div>
                <h2 className="rs-h2" style={{ fontSize: "clamp(1.45rem, 2.5vw, 1.85rem)" }}>
                  {t.ctaTitle}
                </h2>
                <p className="rs-subtitle" style={{ marginTop: "0.65rem" }}>
                  {t.ctaSubtitle}
                </p>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.65rem", justifyContent: "flex-end" }}>
                <a href="#pricing" className="rs-btn-accent">
                  {t.ctaPrimary}
                </a>
                <Link href="/contact" className="rs-btn-ghost">
                  {t.ctaSecondary}
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="rs-footer">
        <div className="rs-footer-grid">
          <div className="rs-footer-col">
            <div style={{ marginBottom: "0.75rem" }}>
              <Image src="/resumora-logo.png" alt="" width={160} height={36} className="rs-logo" sizes="160px" />
            </div>
            <p style={{ margin: 0, fontSize: "0.9rem", lineHeight: 1.65, color: "var(--rs-text-secondary)", maxWidth: "32ch" }}>{t.footerTagline}</p>
          </div>
          <div className="rs-footer-col">
            <h4>{t.footerColProduct}</h4>
            <ul className="rs-footer-links">
              <li>
                <a href="#services">{t.footerServices}</a>
              </li>
              <li>
                <a href="#pricing">{t.footerPricing}</a>
              </li>
              <li>
                <a href="#upload">{t.footerUpload}</a>
              </li>
              <li>
                <a href="#trust">{t.footerTrust}</a>
              </li>
              <li>
                <a href="#process">{t.footerProcess}</a>
              </li>
              <li>
                <a href="#countries">{t.footerRegions}</a>
              </li>
              <li>
                <a href="#testimonials">{t.footerStories}</a>
              </li>
            </ul>
          </div>
          <div className="rs-footer-col">
            <h4>{t.footerColCompany}</h4>
            <ul className="rs-footer-links">
              <li>
                <Link href="/about">{t.footerAbout}</Link>
              </li>
              <li>
                <Link href="/contact">{t.footerContact}</Link>
              </li>
              <li>
                <Link href="/support">{t.footerSupport}</Link>
              </li>
            </ul>
          </div>
          <div className="rs-footer-col">
            <h4>{t.footerColLegal}</h4>
            <ul className="rs-footer-links">
              <li>
                <Link href="/terms">{t.footerTerms}</Link>
              </li>
              <li>
                <Link href="/privacy">{t.footerPrivacy}</Link>
              </li>
            </ul>
          </div>
        </div>
        <div className="rs-footer-meta">{t.footerCopy}</div>
      </footer>
    </div>
  );
}
