import {
  BriefcaseBusiness,
  CheckCircle2,
  ClipboardPenLine,
  FileText,
  Globe2,
  Headphones,
  Languages,
  MapPin,
  Mic2,
  PenLine,
  Shield,
  Sparkles,
  Building2,
} from "lucide-react";

/** Shared UI strings (EN/FR). Homepage weekly-specific strings live in weekly-content.js */
export const translations = {
  en: {
    navHome: "Home",
    navWeekly: "Weekly",
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
    capabilitiesTitle: "Enterprise capabilities",
    capabilitiesSubtitle: "Institutional-grade modules mapped to hiring committee expectations.",
    servicesPageTitle: "Services & intake",
    servicesPageSubtitle: "Begin with encrypted upload or explore each delivery lane.",
    pricingTitle: "Transparent pricing",
    pricingSubtitle:
      "Increasing depth, revision allocation, and senior oversight—pricing unchanged across regions.",
    popular: "Most selected",
    selectPlan: "Select plan",
    processing: "Processing…",
    deliveryProtocolsTitle: "Delivery protocols",
    deliveryProtocolsSubtitle:
      "Governed milestones from encrypted intake to ATS-safe export—repeatable for audit and scale.",
    countriesTitle: "Regional resume conventions",
    countriesSubtitle:
      "Page norms and tonal registers tuned per jurisdiction. Plans and checkout remain USD-consistent worldwide.",
    regionsToggleHint: "Expand a macro-region to review country-level norms.",
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
    trustTitle: "Operating metrics sponsors expect",
    trustSubtitle:
      "Consistency you can cite in stakeholder updates—delivery cadence, satisfaction, and scale.",
    trustStrip: "Greenhouse · Lever · Workday · ATS-safe PDF/DOC · Global hiring desks · EN/FR delivery",
    marketingArchiveTitle: "Weekly marketing editions",
    marketingArchiveSubtitle: "Each week the homepage spotlight rotates—browse prior themes or return to the live edition.",
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
    footerWeekly: "Weekly content",
    footerTerms: "Terms",
    footerPrivacy: "Privacy",
    footerSupport: "Support",
    footerContact: "Contact",
    footerCopy: "© 2026 Resumora. All rights reserved.",
    installPwaTitle: "Install Resumora for faster access",
    installPwaInstall: "Install app",
    installPwaDismiss: "Not now",
  },
  fr: {
    navHome: "Accueil",
    navWeekly: "Hebdo",
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
    capabilitiesTitle: "Capacités entreprise",
    capabilitiesSubtitle: "Modules niveau institutionnel alignés sur attentes de comités de recrutement.",
    servicesPageTitle: "Services & réception",
    servicesPageSubtitle: "Commencez par un téléversement sécurisé ou explorez chaque volet.",
    pricingTitle: "Tarification transparente",
    pricingSubtitle:
      "Profondeur, volume de révisions et supervision senior progressifs—prix USD stable quelle que soit la région.",
    popular: "Le plus choisi",
    selectPlan: "Sélectionner le plan",
    processing: "Traitement…",
    deliveryProtocolsTitle: "Protocoles de livraison",
    deliveryProtocolsSubtitle:
      "Jalons gouvernés—de l’intake chiffré à l’export compatible ATS, reproductibles pour audit et montée en charge.",
    countriesTitle: "Conventions par pays",
    countriesSubtitle:
      "Longueurs de page et registres de ton par juridiction. Tarification et passage en caisse inchangés mondialement.",
    regionsToggleHint: "Déployez une macro-région pour voir les normes par pays.",
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
    trustTitle: "Indicateurs attendus en comité",
    trustSubtitle:
      "Des références opérationnelles—cadence, satisfaction et ampleur—pas des tableaux décoratifs.",
    trustStrip:
      "Greenhouse · Lever · Workday · PDF/DOC compatibles ATS · Recrutement global · Livrables EN/FR",
    marketingArchiveTitle: "Éditions marketing hebdomadaires",
    marketingArchiveSubtitle:
      "La une change chaque semaine—consultez les thèmes précédents ou revenez à l’édition en cours.",
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
    footerWeekly: "Contenu hebdo",
    footerTerms: "Conditions",
    footerPrivacy: "Confidentialité",
    footerSupport: "Support",
    footerContact: "Contact",
    footerCopy: "© 2026 Resumora. Tous droits réservés.",
    installPwaTitle: "Installer Resumora pour un accès plus rapide",
    installPwaInstall: "Installer",
    installPwaDismiss: "Plus tard",
  },
};

export function processSteps(lang) {
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

export function testimonialsList(lang) {
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

export const SERVICE_LABELS = {
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

export const servicesByLang = {
  en: [
    {
      resourceKey: "svc_ats",
      category: "Resume strategy",
      title: "ATS resume optimisation",
      description:
        "Full-spectrum rewrite with lexical precision, parser-safe layout, and section flow proven across major ATS vendors.",
      ctaHref: "/services#intake",
      ctaLabel: "Upload for review",
      Icon: FileText,
    },
    {
      resourceKey: "svc_letter",
      category: "Application assets",
      title: "Strategic cover letter",
      description:
        "Narratives tied to mandate, culture cues, and quantified proof so submissions feel bespoke at scale.",
      ctaHref: "/services#intake",
      ctaLabel: "Start with intake",
      Icon: PenLine,
    },
    {
      resourceKey: "svc_linkedin",
      category: "Personal brand",
      title: "LinkedIn repositioning",
      description:
        "Authority-forward headline, featured media, and discoverability calibrated to recruiter search norms.",
      ctaHref: "/pricing",
      ctaLabel: "Select tier",
      Icon: BriefcaseBusiness,
    },
    {
      resourceKey: "svc_interview",
      category: "Interview readiness",
      title: "Interview preparation",
      description:
        "Scenario drills and executive presence aligned to your reconstructed dossier—not generic scripts.",
      ctaHref: "/pricing",
      ctaLabel: "Book preparation",
      Icon: Mic2,
    },
    {
      resourceKey: "svc_tls",
      category: "Localisation",
      title: "Translation / TLS",
      description:
        "Native-grade EN/FR pairs with tonal harmonisation across resume, outreach, and follow-up artefacts.",
      ctaHref: "/global-reach",
      ctaLabel: "Regional standards",
      Icon: Languages,
    },
    {
      resourceKey: "svc_support",
      category: "Concierge",
      title: "Priority support",
      description:
        "Concierge pacing, explicit SLAs, and direct escalation whenever velocity is non-negotiable.",
      ctaHref: "/pricing",
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
      ctaHref: "/services#intake",
      ctaLabel: "Téléverser pour audit",
      Icon: FileText,
    },
    {
      resourceKey: "svc_letter",
      category: "Dossiers candidature",
      title: "Lettre stratégique",
      description:
        "Narratifs reliés au mandat, signaux culture et preuves chiffrées pour un rendu sur-mesure industriel.",
      ctaHref: "/services#intake",
      ctaLabel: "Par l’intake",
      Icon: PenLine,
    },
    {
      resourceKey: "svc_linkedin",
      category: "Marque personnelle",
      title: "Relance LinkedIn",
      description:
        "Titre d’autorité, médias vedettes et découvrabilité calibrées aux usages de recherche recruteur.",
      ctaHref: "/pricing",
      ctaLabel: "Choisir le palier",
      Icon: BriefcaseBusiness,
    },
    {
      resourceKey: "svc_interview",
      category: "Entretien",
      title: "Préparation entretien",
      description:
        "Drills situationnels et présence cadre synchronisés sur votre dossier reconstruit—pas de scripts génériques.",
      ctaHref: "/pricing",
      ctaLabel: "Réserver",
      Icon: Mic2,
    },
    {
      resourceKey: "svc_tls",
      category: "Localisation",
      title: "Traduction / TLS",
      description:
        "Paires EN/FR niveau native avec harmonisation sur tous les artefacts de poursuite.",
      ctaHref: "/global-reach",
      ctaLabel: "Standards régionaux",
      Icon: Languages,
    },
    {
      resourceKey: "svc_support",
      category: "Conciergerie",
      title: "Support prioritaire",
      description:
        "Rythme concierge, SLA explicites et remontée directe lorsque la vitesse est critique.",
      ctaHref: "/pricing",
      ctaLabel: "Monter de palier",
      Icon: Headphones,
    },
  ],
};

export const pricingPlans = [
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

export const performanceStats = {
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

export const REGION_ICONS = {
  "north-america": Globe2,
  europe: Building2,
  "middle-east": MapPin,
  gulf: Sparkles,
  africa: Globe2,
  "asia-pacific": Globe2,
  "international-executive": BriefcaseBusiness,
};
