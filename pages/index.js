import { useId, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Bookmark,
  BriefcaseBusiness,
  Building2,
  CheckCircle2,
  ChevronDown,
  ClipboardPenLine,
  Crown,
  FileText,
  Globe2,
  Headphones,
  Heart,
  Languages,
  MapPin,
  Menu,
  Mic2,
  PenLine,
  Shield,
  Sparkles,
  X,
} from "lucide-react";
import { regionGroups } from "../lib/data/regions-marketing";

const translations = {
  en: {
    navTrust: "Trust",
    navServices: "Services",
    navPricing: "Pricing",
    navProcess: "Process",
    navCountries: "Regions",
    navCapabilities: "Capabilities",
    navDelivery: "Delivery",
    navEngagement: "Engagement",
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
    regionsToggleHint: "Expand a macro-region to review country-level norms.",
    deliveryProtocolsTitle: "Delivery protocols",
    deliveryProtocolsSubtitle:
      "Governed milestones from encrypted intake to ATS-safe export—repeatable for audit and scale.",
    engagementTitle: "Live engagement & momentum",
    engagementSubtitle:
      "Authenticated metrics from Neon-backed interactions—no vanity counters. Follow Resumora for release cadence.",
    engagementFollow: "Follow Resumora",
    engagementFollowing: "Following",
    engagementLike: "Like",
    engagementSave: "Save",
    engagementRequest: "Intent signal",
    engagementTrending: "Trending services",
    engagementMostLiked: "Most liked",
    engagementMostSaved: "Most saved",
    engagementMostRequested: "Most requested",
    engagementRegional: "Regional interest",
    engagementDisabled: "Engagement requires database connection (Neon).",
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
    footerCapabilities: "Capabilities",
    footerDelivery: "Delivery",
    footerEngagement: "Engagement",
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
    navCapabilities: "Capacités",
    navDelivery: "Livraison",
    navEngagement: "Engagement",
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
    regionsToggleHint: "Déployez une macro-région pour voir les normes par pays.",
    deliveryProtocolsTitle: "Protocoles de livraison",
    deliveryProtocolsSubtitle:
      "Jalons gouvernés—de l’intake chiffré à l’export compatible ATS, reproductibles pour audit et montée en charge.",
    engagementTitle: "Engagement en direct",
    engagementSubtitle:
      "Indicateurs issus d’interactions stockées sur Neon—pas de faux compteurs. Suivez Resumora pour la cadence produit.",
    engagementFollow: "Suivre Resumora",
    engagementFollowing: "Abonné",
    engagementLike: "J’aime",
    engagementSave: "Enregistrer",
    engagementRequest: "Signal d’intention",
    engagementTrending: "Services tendance",
    engagementMostLiked: "Plus aimés",
    engagementMostSaved: "Plus sauvegardés",
    engagementMostRequested: "Plus demandés",
    engagementRegional: "Intérêt régional",
    engagementDisabled: "L’engagement nécessite Neon (base de données).",
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
    footerCapabilities: "Capacités",
    footerDelivery: "Livraison",
    footerEngagement: "Engagement",
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

const SERVICE_LABELS = {
  en: {
    svc_ats: "ATS optimisation",
    svc_letter: "Strategic letter",
    svc_linkedin: "LinkedIn relaunch",
    svc_interview: "Interview prep",
    svc_tls: "Translation / TLS",
    svc_support: "Priority support",
  },
  fr: {
    svc_ats: "Optimisation ATS",
    svc_letter: "Lettre stratégique",
    svc_linkedin: "Relance LinkedIn",
    svc_interview: "Préparation entretien",
    svc_tls: "Traduction / TLS",
    svc_support: "Support prioritaire",
  },
};

const services = {
  en: [
    {
      resourceKey: "svc_ats",
      category: "Resume strategy",
      title: "ATS resume optimisation",
      description:
        "Full-spectrum rewrite with lexical precision, parser-safe layout, and section flow proven across major ATS vendors.",
      ctaHref: "#upload",
      ctaLabel: "Upload for review",
      Icon: FileText,
    },
    {
      resourceKey: "svc_letter",
      category: "Application assets",
      title: "Strategic cover letter",
      description:
        "Narratives tied to mandate, culture cues, and quantified proof so submissions feel bespoke at scale.",
      ctaHref: "#upload",
      ctaLabel: "Start with intake",
      Icon: PenLine,
    },
    {
      resourceKey: "svc_linkedin",
      category: "Personal brand",
      title: "LinkedIn repositioning",
      description:
        "Authority-forward headline, featured media, and discoverability calibrated to recruiter search norms.",
      ctaHref: "#pricing",
      ctaLabel: "Select tier",
      Icon: BriefcaseBusiness,
    },
    {
      resourceKey: "svc_interview",
      category: "Interview readiness",
      title: "Interview preparation",
      description:
        "Scenario drills and executive presence aligned to your reconstructed dossier—not generic scripts.",
      ctaHref: "#pricing",
      ctaLabel: "Book preparation",
      Icon: Mic2,
    },
    {
      resourceKey: "svc_tls",
      category: "Localisation",
      title: "Translation / TLS",
      description:
        "Native-grade EN/FR pairs with tonal harmonisation across resume, outreach, and follow-up artefacts.",
      ctaHref: "#countries",
      ctaLabel: "Regional standards",
      Icon: Languages,
    },
    {
      resourceKey: "svc_support",
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
      resourceKey: "svc_ats",
      category: "Stratégie CV",
      title: "Optimisation CV ATS",
      description:
        "Réécriture complète, mise en page parseur-safe et enchaînement de sections éprouvé chez les grands ATS.",
      ctaHref: "#upload",
      ctaLabel: "Téléverser pour audit",
      Icon: FileText,
    },
    {
      resourceKey: "svc_letter",
      category: "Dossiers candidature",
      title: "Lettre stratégique",
      description:
        "Narratifs reliés au mandat, signaux culture et preuves chiffrées pour un rendu sur-mesure industriel.",
      ctaHref: "#upload",
      ctaLabel: "Par l’intake",
      Icon: PenLine,
    },
    {
      resourceKey: "svc_linkedin",
      category: "Marque personnelle",
      title: "Relance LinkedIn",
      description:
        "Titre d’autorité, médias vedettes et découvrabilité calibrées aux usages de recherche recruteur.",
      ctaHref: "#pricing",
      ctaLabel: "Choisir le palier",
      Icon: BriefcaseBusiness,
    },
    {
      resourceKey: "svc_interview",
      category: "Entretien",
      title: "Préparation entretien",
      description:
        "Drills situationnels et présence cadre synchronisés sur votre dossier reconstruit—pas de scripts génériques.",
      ctaHref: "#pricing",
      ctaLabel: "Réserver",
      Icon: Mic2,
    },
    {
      resourceKey: "svc_tls",
      category: "Localisation",
      title: "Traduction / TLS",
      description:
        "Paires EN/FR niveau native avec harmonisation sur tous les artefacts de poursuite.",
      ctaHref: "#countries",
      ctaLabel: "Standards régionaux",
      Icon: Languages,
    },
    {
      resourceKey: "svc_support",
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

const REGION_ICONS = {
  "north-america": Globe2,
  europe: Building2,
  "middle-east": MapPin,
  gulf: Sparkles,
  africa: Globe2,
  "asia-pacific": Globe2,
  "international-executive": BriefcaseBusiness,
};

export default function HomePage() {
  const [lang, setLang] = useState("en");
  const [uploadStatus, setUploadStatus] = useState("");
  const [busyPlan, setBusyPlan] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [openRegionId, setOpenRegionId] = useState(regionGroups.en[0]?.id ?? "");
  const [engStats, setEngStats] = useState(null);
  const [engBusy, setEngBusy] = useState(false);
  const uploadFieldId = useId();

  const regions = regionGroups[lang];

  useEffect(() => {
    let cancelled = false;
    fetch("/api/engagement/stats")
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setEngStats(data);
      })
      .catch(() => {
        if (!cancelled) setEngStats({ enabled: false });
      });
    return () => {
      cancelled = true;
    };
  }, []);

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

  const regionHint = () =>
    typeof navigator !== "undefined"
      ? `${navigator.language || ""}|${Intl.DateTimeFormat().resolvedOptions().timeZone || ""}`
      : "";

  const refreshEngagement = async () => {
    const r = await fetch("/api/engagement/stats", { credentials: "same-origin" });
    if (r.ok) setEngStats(await r.json());
  };

  const runEngagementAction = async (payload) => {
    if (engBusy) return;
    setEngBusy(true);
    try {
      const res = await fetch("/api/engagement/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ ...payload, regionHint: regionHint() }),
      });
      if (res.ok) await refreshEngagement();
      else if (res.status === 503) window.alert(t.engagementDisabled);
    } finally {
      setEngBusy(false);
    }
  };

  const closeMenu = () => setMenuOpen(false);

  const navLinks = (
    <>
      <a href="#trust" onClick={closeMenu}>
        {t.navTrust}
      </a>
      <a href="#capabilities" onClick={closeMenu}>
        {t.navCapabilities}
      </a>
      <a href="#pricing" onClick={closeMenu}>
        {t.navPricing}
      </a>
      <a href="#delivery-protocols" onClick={closeMenu}>
        {t.navDelivery}
      </a>
      <a href="#countries" onClick={closeMenu}>
        {t.navCountries}
      </a>
      <a href="#engagement" onClick={closeMenu}>
        {t.navEngagement}
      </a>
      <a href="#testimonials" onClick={closeMenu}>
        {t.navTestimonials}
      </a>
      <Link href="/contact" onClick={closeMenu}>
        {t.navContact}
      </Link>
    </>
  );

  const labels = SERVICE_LABELS[lang];
  const trendingMerged = useMemo(() => {
    const likes = engStats?.likesByResource || [];
    const reqs = engStats?.requestsByResource || [];
    const map = {};
    for (const r of likes) map[r.key] = (map[r.key] || 0) + Number(r.count || 0);
    for (const r of reqs) map[r.key] = (map[r.key] || 0) + Number(r.count || 0) * 2;
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([key, count]) => ({ key, count }));
  }, [engStats]);
  const mostSaved = engStats?.savesByResource?.slice(0, 6) ?? [];
  const mostRequested = engStats?.requestsByResource?.slice(0, 6) ?? [];

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

        <section id="capabilities" className="rs-section">
          <div className="rs-container">
            <p className="rs-eyebrow">{t.navCapabilities}</p>
            <h2 className="rs-h2">{t.servicesTitle}</h2>
            <p className="rs-subtitle">{t.servicesSubtitle}</p>
            <div className="rs-card-grid">
              {services[lang].map((item) => {
                const I = item.Icon;
                const liked = engStats?.myLikes?.includes(item.resourceKey);
                const saved = engStats?.mySaves?.includes(item.resourceKey);
                return (
                  <article key={item.resourceKey} className="rs-service-card">
                    <span className="rs-cat-pill">
                      {t.serviceCategory}: {item.category}
                    </span>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <I size={22} strokeWidth={1.45} className="rs-icon-gold" aria-hidden />
                      <h3>{item.title}</h3>
                    </div>
                    <p>{item.description}</p>
                    <div className="rs-engage-row" aria-label="Engagement">
                      <button
                        type="button"
                        className="rs-engage-pill"
                        data-active={liked ? "true" : "false"}
                        disabled={engBusy}
                        onClick={() => runEngagementAction({ type: "like", resourceKey: item.resourceKey })}
                      >
                        <Heart size={16} strokeWidth={1.5} className="rs-icon-gold" fill={liked ? "currentColor" : "none"} aria-hidden />
                        {t.engagementLike}
                      </button>
                      <button
                        type="button"
                        className="rs-engage-pill"
                        data-active={saved ? "true" : "false"}
                        disabled={engBusy}
                        onClick={() => runEngagementAction({ type: "save", resourceKey: item.resourceKey })}
                      >
                        <Bookmark size={16} strokeWidth={1.5} className="rs-icon-gold" fill={saved ? "currentColor" : "none"} aria-hidden />
                        {t.engagementSave}
                      </button>
                      <button
                        type="button"
                        className="rs-engage-pill"
                        data-active="false"
                        disabled={engBusy}
                        onClick={() => runEngagementAction({ type: "request", resourceKey: item.resourceKey })}
                      >
                        {t.engagementRequest}
                      </button>
                    </div>
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

        <section id="delivery-protocols" className="rs-section rs-section-muted">
          <div className="rs-container">
            <p className="rs-eyebrow">{t.navDelivery}</p>
            <h2 className="rs-h2">{t.deliveryProtocolsTitle}</h2>
            <p className="rs-subtitle">{t.deliveryProtocolsSubtitle}</p>
            <div className="rs-delivery-grid">
              {steps.map((s) => {
                const I = s.Icon;
                return (
                  <article key={s.step} className="rs-delivery-card">
                    <div className="rs-delivery-step">{s.step}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", marginTop: "0.5rem" }}>
                      <I size={22} strokeWidth={1.45} className="rs-icon-gold" aria-hidden />
                      <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 800 }}>{s.title}</h3>
                    </div>
                    <p className="rs-delivery-desc">{s.detail}</p>
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
            <p className="rs-regions-hint">{t.regionsToggleHint}</p>
            <div className="rs-region-groups">
              {regions.map((region) => {
                const Icon = REGION_ICONS[region.id] || Globe2;
                const open = openRegionId === region.id;
                return (
                  <div key={region.id} className="rs-region-shell">
                    <button
                      type="button"
                      className="rs-region-trigger"
                      aria-expanded={open}
                      onClick={() => setOpenRegionId((cur) => (cur === region.id ? "" : region.id))}
                    >
                      <span className="rs-region-trigger-main">
                        <Icon className="rs-icon-gold" size={22} strokeWidth={1.45} aria-hidden />
                        <span className="rs-region-title">{region.title}</span>
                      </span>
                      <span className="rs-region-summary">{region.summary}</span>
                      <ChevronDown
                        size={22}
                        className="rs-region-chevron"
                        data-open={open ? "true" : "false"}
                        aria-hidden
                      />
                    </button>
                    {open ? (
                      <div className="rs-region-panel">
                        <div className="rs-region-grid">
                          {region.countries.map((c) => (
                            <article key={`${region.id}-${c.country}`} className="rs-region-card">
                              <div className="rs-region-name">{c.country}</div>
                              <div className="rs-region-standard">{c.standard}</div>
                              <p className="rs-region-desc">{c.line}</p>
                            </article>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section id="engagement" className="rs-section rs-section-muted">
          <div className="rs-container">
            <p className="rs-eyebrow">{t.navEngagement}</p>
            <h2 className="rs-h2">{t.engagementTitle}</h2>
            <p className="rs-subtitle">{t.engagementSubtitle}</p>
            <div className="rs-engage-hero">
              <div className="rs-engage-metrics">
                <div className="rs-engage-metric">
                  <span className="rs-engage-metric-value">{engStats?.followers ?? "—"}</span>
                  <span className="rs-engage-metric-label">{lang === "en" ? "Followers" : "Abonnés"}</span>
                </div>
                <div className="rs-engage-metric">
                  <span className="rs-engage-metric-value">{engStats?.registrations ?? "—"}</span>
                  <span className="rs-engage-metric-label">{lang === "en" ? "Registered clients" : "Clients inscrits"}</span>
                </div>
                <div className="rs-engage-metric">
                  <span className="rs-engage-metric-value">{engStats?.enabled === false ? "—" : "Live"}</span>
                  <span className="rs-engage-metric-label">{lang === "en" ? "Neon sync" : "Sync Neon"}</span>
                </div>
              </div>
              <button
                type="button"
                className="rs-btn-accent"
                disabled={engBusy}
                onClick={() => runEngagementAction({ type: engStats?.followingBrand ? "unfollow" : "follow" })}
              >
                {engStats?.followingBrand ? t.engagementFollowing : t.engagementFollow}
              </button>
              <Link href="/dashboard" className="rs-btn-ghost">
                {lang === "en" ? "Analytics dashboard" : "Tableau analytics"}
              </Link>
            </div>
            <div className="rs-engage-quad">
              <div className="rs-engage-quad-col">
                <h3 className="rs-engage-quad-title">{t.engagementTrending}</h3>
                <ul className="rs-engage-list">
                  {trendingMerged.map((row) => (
                    <li key={row.key}>
                      <span>{labels[row.key] || row.key}</span>
                      <span className="rs-engage-count">{row.count}</span>
                    </li>
                  ))}
                  {!trendingMerged.length ? <li className="rs-engage-empty">{lang === "en" ? "Awaiting first signals" : "En attente de signaux"}</li> : null}
                </ul>
              </div>
              <div className="rs-engage-quad-col">
                <h3 className="rs-engage-quad-title">{t.engagementMostLiked}</h3>
                <ul className="rs-engage-list">
                  {(engStats?.likesByResource || []).slice(0, 6).map((row) => (
                    <li key={`like-${row.key}`}>
                      <span>{labels[row.key] || row.key}</span>
                      <span className="rs-engage-count">{row.count}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rs-engage-quad-col">
                <h3 className="rs-engage-quad-title">{t.engagementMostSaved}</h3>
                <ul className="rs-engage-list">
                  {mostSaved.map((row) => (
                    <li key={`save-${row.key}`}>
                      <span>{labels[row.key] || row.key}</span>
                      <span className="rs-engage-count">{row.count}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rs-engage-quad-col">
                <h3 className="rs-engage-quad-title">{t.engagementMostRequested}</h3>
                <ul className="rs-engage-list">
                  {mostRequested.map((row) => (
                    <li key={`req-${row.key}`}>
                      <span>{labels[row.key] || row.key}</span>
                      <span className="rs-engage-count">{row.count}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="rs-engage-regional">
              <h3 className="rs-engage-quad-title">{t.engagementRegional}</h3>
              <div className="rs-engage-region-chips">
                {(engStats?.regional || []).map((r) => (
                  <span key={r.region} className="rs-chip">
                    {r.region}: {r.count}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="testimonials" className="rs-section">
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
                <a href="#capabilities">{t.footerCapabilities}</a>
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
                <a href="#delivery-protocols">{t.footerDelivery}</a>
              </li>
              <li>
                <a href="#countries">{t.footerRegions}</a>
              </li>
              <li>
                <a href="#engagement">{t.footerEngagement}</a>
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
              <li>
                <Link href="/dashboard">{lang === "en" ? "Dashboard" : "Tableau"}</Link>
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
