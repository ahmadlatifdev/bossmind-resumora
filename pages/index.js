import { useId, useMemo, useState } from "react";
import Link from "next/link";
import {
  Award,
  BriefcaseBusiness,
  CheckCircle2,
  ClipboardPenLine,
  Crown,
  FileText,
  Globe2,
  Headphones,
  Languages,
  LayoutGrid,
  Lock,
  Menu,
  Mic2,
  PenLine,
  Shield,
  ShieldCheck,
  Sparkles,
  X,
  Zap,
} from "lucide-react";

const GOLD = "#D4AF37";
const ICON_WRAP = {
  strokeWidth: 1.45,
  size: 22,
  color: GOLD,
};

const translations = {
  en: {
    navServices: "Services",
    navPricing: "Pricing",
    navUpload: "Upload",
    navCountries: "Countries",
    navPerformance: "Performance",
    navWhy: "Why Resumora",
    navContact: "Contact",
    navLogin: "Login",
    navRegister: "Register",
    openMenu: "Open menu",
    closeMenu: "Close menu",
    logoTagline: "Premium Career Studio",
    heroKicker: "Executive resume studio",
    heroHeadline: "Win Interviews Faster with Institutional-Grade Documents",
    heroSubtitle:
      "Resumora fuses recruiter psychology, ATS engineering, and premium writing to reposition your achievements for global hiring markets—without looking like AI.",
    heroPrimary: "Start Premium Plan",
    heroSecondary: "Upload Resume / CV",
    heroPanelTitle: "Application readiness",
    heroPanelSubtitle: "What we optimise",
    heroLine1: "ATS keyword architecture",
    heroLine2: "Human recruiter clarity",
    heroLine3: "Executive tone & pacing",
    trustA: "Trusted by 16,000+ Professionals",
    trustB: "98.2% Client Satisfaction",
    trustC: "34h Average Delivery",
    marqueeTitle: "Formats & platforms we engineer for",
    marqueeItems: ["Greenhouse · Lever · Workday", "PDF/DOC ATS parsing", "Global hiring teams", "Bilingual EN/FR delivery"],
    whyTitle: "Why leaders choose Resumora",
    whySubtitle:
      "Designed for competitiveness in Fortune-level hiring pipelines, VC-backed startups, and international relocation.",
    processTitle: "How your white-glove delivery works",
    processSubtitle:
      "A repeatable premium workflow that preserves your voice while elevating measurable impact.",
    securityTitle: "Confidential delivery you can stake your reputation on",
    securitySubtitle: "Commercial-grade safeguards for sensitive career data across every milestone.",
    uploadTitle: "Upload Your Resume / CV",
    uploadText:
      "Encrypted intake for a bespoke audit. Specialists score ATS alignment, recruiter scanability, and leadership narrative clarity before prescribing your upgrade path.",
    uploadButton: "Upload Document",
    uploadSuccess: "Upload completed successfully.",
    uploadError: "Upload failed. Please try again.",
    uploadHint: "Accepted formats: PDF, DOC, DOCX.",
    servicesTitle: "Premium Services",
    servicesSubtitle:
      "Every deliverable blends narrative sophistication with machine-parseable excellence.",
    serviceAction: "Start with Upload",
    pricingTitle: "Transparent Plans",
    pricingSubtitle: "Straightforward tiers with escalating depth, speed priority, and senior oversight.",
    popular: "Most popular",
    choosePlan: "Choose Plan",
    processing: "Processing...",
    performanceTitle: "Performance Metrics",
    performanceSubtitle:
      "Velocity and delight metrics anchored to real fulfilment—not vanity dashboards.",
    countriesTitle: "Global Reach",
    countriesSubtitle:
      "Market-aware positioning for multinational employers and cross-border mobility scenarios.",
    ctaTitle: "Ready when you are.",
    ctaSubtitle: "Reserve your strategist and secure same-week delivery windows on Professional and Elite tiers.",
    ctaPrimary: "Select a Plan",
    ctaSecondary: "Talk to Concierge",
    footerTagline:
      "Resumora orchestrates ATS-grade documents and boardroom narration for ambitious professionals.",
    footerColProduct: "Product",
    footerColCompany: "Company",
    footerColLegal: "Legal",
    footerAbout: "About",
    footerServices: "Services",
    footerPricing: "Pricing",
    footerUpload: "Upload",
    footerCountries: "Countries",
    footerPerformance: "Performance",
    footerWhy: "Why Resumora",
    footerTerms: "Terms",
    footerPrivacy: "Privacy",
    footerSupport: "Support",
    footerContact: "Contact",
    footerCopy: "Copyright 2026 Resumora. All rights reserved.",
  },
  fr: {
    navServices: "Services",
    navPricing: "Tarifs",
    navUpload: "Téléversement",
    navCountries: "Pays",
    navPerformance: "Performance",
    navWhy: "Pourquoi Resumora",
    navContact: "Contact",
    navLogin: "Connexion",
    navRegister: "Inscription",
    openMenu: "Ouvrir le menu",
    closeMenu: "Fermer le menu",
    logoTagline: "Studio carrière premium",
    heroKicker: "Studio de CV exécutif",
    heroHeadline: "Obtenez des entretiens plus vite avec des documents niveau institutionnel",
    heroSubtitle:
      "Resumora fusionne la psychologie recruteur, l’ingénierie ATS et la rédaction premium pour repositionner vos réalisations sur les marchés mondiaux—sans effet générique IA.",
    heroPrimary: "Démarrer le plan premium",
    heroSecondary: "Téléverser CV / résumé",
    heroPanelTitle: "Préparation candidature",
    heroPanelSubtitle: "Ce que nous optimisons",
    heroLine1: "Architecture ATS mots-clés",
    heroLine2: "Clarté recruteur humaine",
    heroLine3: "Ton et rythme de direction",
    trustA: "Plébiscité par 16 000+ professionnels",
    trustB: "98.2 % de satisfaction client",
    trustC: "34 h de délai moyen",
    marqueeTitle: "Formats et plateformes couverts",
    marqueeItems: ["Greenhouse · Lever · Workday", "Analyse ATS PDF/DOC", "Équipes recrutement mondiales", "Livrables bilingues EN/FR"],
    whyTitle: "Pourquoi les décideurs choisissent Resumora",
    whySubtitle:
      "Conçu pour rivaliser avec les viviers Fortune, les scale-ups financées VC et les mobilités internationales.",
    processTitle: "Votre parcours clé en main",
    processSubtitle:
      "Une méthodologie premium qui conserve votre voix tout en augmentant votre impact mesurable.",
    securityTitle: "Une confidentialité à la hauteur de votre réputation",
    securitySubtitle: "Des garanties niveau entreprise pour vos données les plus sensibles.",
    uploadTitle: "Téléversez votre CV / résumé",
    uploadText:
      "Réception sécurisée pour un audit sur mesure. Nos spécialistes évaluent l’ATS, la lisibilité recruteur et la narration de leadership avant de recommander votre trajectoire.",
    uploadButton: "Téléverser le document",
    uploadSuccess: "Téléversement terminé avec succès.",
    uploadError: "Échec du téléversement. Veuillez réessayer.",
    uploadHint: "Formats acceptés : PDF, DOC, DOCX.",
    servicesTitle: "Services premium",
    servicesSubtitle:
      "Chaque livrable marie narration sophistiquée et excellence lisible par les machines.",
    serviceAction: "Commencer par le téléversement",
    pricingTitle: "Plans transparents",
    pricingSubtitle:
      "Des paliers nets avec davantage de profondeur, de priorité délai et de supervision senior.",
    popular: "Le plus demandé",
    choosePlan: "Choisir le plan",
    processing: "Traitement…",
    performanceTitle: "Indicateurs clés",
    performanceSubtitle:
      "Vitesses et satisfaction ancrées sur la livraison réelle, pas sur des tableaux cosmétiques.",
    countriesTitle: "Portée mondiale",
    countriesSubtitle:
      "Positionnement adapté aux employeurs internationaux et aux parcours de mobilité transfrontière.",
    ctaTitle: "Prêt lorsque vous l’êtes.",
    ctaSubtitle:
      "Réservez votre stratège et sécurisez des créneaux de livraison sous la même semaine sur Professionnel et Élite.",
    ctaPrimary: "Choisir un plan",
    ctaSecondary: "Parler au concierge",
    footerTagline:
      "Resumora orchestre des documents ATS et une narration niveau CODIR pour cadres ambitieux.",
    footerColProduct: "Produit",
    footerColCompany: "Entreprise",
    footerColLegal: "Juridique",
    footerAbout: "À propos",
    footerServices: "Services",
    footerPricing: "Tarifs",
    footerUpload: "Téléversement",
    footerCountries: "Pays",
    footerPerformance: "Performance",
    footerWhy: "Pourquoi Resumora",
    footerTerms: "Conditions",
    footerPrivacy: "Confidentialité",
    footerSupport: "Support",
    footerContact: "Contact",
    footerCopy: "Copyright 2026 Resumora. Tous droits réservés.",
  },
};

function whyBullets(lang) {
  return lang === "en"
    ? [
        {
          title: "Dual-lens rewriting",
          text: "Every line is calibrated for scanners and seasoned hiring managers—not keyword stuffing templates.",
          Icon: Zap,
        },
        {
          title: "Executive narrative design",
          text: "We architect proof points so revenue, complexity, and scope read instantly credible at the top of page one.",
          Icon: Sparkles,
        },
        {
          title: "Competitive benchmarking",
          text: "Role framing references market expectations for salary bands, geography, and industry velocity.",
          Icon: Globe2,
        },
        {
          title: "Speed without compromise",
          text: "Dedicated revision windows so you iterate fast while maintaining luxury polish.",
          Icon: Award,
        },
      ]
    : [
        {
          title: "Double lecture stratégique",
          text: "Chaque ligne vise filtres ATS et recruteurs seniors—sans remplissage de mots-clés.",
          Icon: Zap,
        },
        {
          title: "Narration cadre premium",
          text: "Architecture des preuves pour que chiffres, périmètre et complexité se lisent dès la page 1.",
          Icon: Sparkles,
        },
        {
          title: "Bench de marché",
          text: "Cadrage des postes selon attentes géographiques, secteur et niveau de rémunération.",
          Icon: Globe2,
        },
        {
          title: "Rapidité maîtrisée",
          text: "Fenêtres de révision dédiées pour itérer vite sans sacrifier le luxe rédactionnel.",
          Icon: Award,
        },
      ];
}

function processSteps(lang) {
  return lang === "en"
    ? [
        { title: "Secure upload", detail: "We ingest drafts with encrypted handling and classify target roles.", step: "01", Icon: FileText },
        { title: "ATS + human audit", detail: "Two-pass scoring merges parser logic with recruiter skim patterns.", step: "02", Icon: Shield },
        { title: "Executive rewrite", detail: "Senior writers rebuild structure, KPIs, and leadership tone.", step: "03", Icon: ClipboardPenLine },
        { title: "Polish & release", detail: "Micro-edits validate fonts, ATS-safe layout, then final delivery.", step: "04", Icon: CheckCircle2 },
      ]
    : [
        { title: "Téléversement sécurisé", detail: "Prise en charge chiffrée et qualification des postes visés.", step: "01", Icon: FileText },
        { title: "Audit ATS + humain", detail: "Double lecture croisée parseur et lecture diagonal recruteur.", step: "02", Icon: Shield },
        { title: "Réécriture exécutive", detail: "Plume senior : structure, KPI et ton de leadership.", step: "03", Icon: ClipboardPenLine },
        { title: "Finitions & livraison", detail: "Vérifications typographiques, mise en page ATS-safe, puis remise finale.", step: "04", Icon: CheckCircle2 },
      ];
}

function securityItems(lang) {
  return lang === "en"
    ? [
        { title: "Confidential pipelines", detail: "Access controls for every dossier—from upload to archival.", Icon: Lock },
        { title: "Review governance", detail: "Dual approval checklists mirror agency-grade QA rituals.", Icon: ShieldCheck },
        { title: "Checkout trust", detail: "Enterprise Stripe flows with audited payment handoff.", Icon: LayoutGrid },
      ]
    : [
        { title: "Traitement confidentiel", detail: "Contrôles d’accès sur chaque dossier, du téléversement à l’archivage.", Icon: Lock },
        { title: "Gouvernance qualité", detail: "Listes de validation doubles inspirées du QA agences.", Icon: ShieldCheck },
        { title: "Confiance paiement", detail: "Parcours Stripe avec relais conforme niveau marché.", Icon: LayoutGrid },
      ];
}

const services = {
  en: [
    {
      title: "ATS Resume Optimization",
      description:
        "Full spectrum rewrite with lexical precision, ATS-safe layout, and section sequencing proven across leading ATS vendors.",
      Icon: FileText,
    },
    {
      title: "Cover Letter Generator",
      description:
        "Narratives tied to mandate, culture signals, and quantified accomplishments so responses feel bespoke at scale.",
      Icon: PenLine,
    },
    {
      title: "LinkedIn Optimization",
      description:
        "Authority-led positioning for headline, featured media, storyline, and discoverability cues recruiters actually search.",
      Icon: BriefcaseBusiness,
    },
    {
      title: "Interview Preparation",
      description:
        "Scenario drills, behavioural pivots, and executive presence coaching aligned to your reconstructed resume.",
      Icon: Mic2,
    },
    {
      title: "Translation / TLS",
      description:
        "Native-grade EN/FR pairs with tonal harmonisation across resume, outreach, and follow-up artefacts.",
      Icon: Languages,
    },
    {
      title: "Priority Support",
      description:
        "Concierge pacing, SLA-backed responses, and direct escalation when speed is non-negotiable.",
      Icon: Headphones,
    },
  ],
  fr: [
    {
      title: "Optimisation CV ATS",
      description:
        "Réécriture complète avec précision lexicale, gabarits parseur-safe et enchaînement de sections éprouvé chez les grands ATS.",
      Icon: FileText,
    },
    {
      title: "Lettre stratégique",
      description:
        "Narratifs reliés au mandat, indices de culture et preuves chiffrées pour un rendu sur-mesure industriel.",
      Icon: PenLine,
    },
    {
      title: "Optimisation LinkedIn",
      description:
        "Positionnement autorité : titre, médias vedettes, story et découvrabilité comme les flux recruteur.",
      Icon: BriefcaseBusiness,
    },
    {
      title: "Préparation entretien",
      description:
        "Drills situationnels, angles comportementaux et coaching présence cadre synchronisés sur votre nouveau CV.",
      Icon: Mic2,
    },
    {
      title: "Traduction / TLS",
      description:
        "Paires EN/FR niveau native avec harmonisation rédactionnelle sur tous les artefacts de poursuite.",
      Icon: Languages,
    },
    {
      title: "Support prioritaire",
      description:
        "Rythme concierge, SLA explicites et escalation directe quand la vitesse est critique.",
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
        "One structured revision sprint",
      ],
      fr: [
        "Remédiation ATS approfondie",
        "Hiérarchie typographique premium",
        "Échafaudage mots-clés secteur",
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
        "Cover letter authored to spec",
      ],
      fr: [
        "Toutes les garanties Basic",
        "Rebuild chronologique ou hybride",
        "Mining de réalisations cible métier",
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
        "Dedicated concierge strategist",
      ],
      fr: [
        "Profondeur Professionnel + LinkedIn relancé",
        "Atelier storyline direction",
        "Répétitions entretien enregistrées",
        "Stratège concierge attitré",
      ],
    },
  },
];

const performanceStats = {
  en: [
    { value: "98.2%", label: "Client satisfaction", detail: "Quality + pacing measured post-delivery surveys." },
    { value: "4.7x", label: "Interview lift", detail: "Average uplift after repositioning engagements." },
    { value: "34h", label: "Median fulfilment", detail: "Operational cadence across premium tiers." },
    { value: "16k+", label: "Professionals coached", detail: "From IC contributors to EVP-level mandates." },
  ],
  fr: [
    { value: "98.2%", label: "Satisfaction client", detail: "Qualité et rythmes mesurés après livraison." },
    { value: "4.7x", label: "Gain d’entretiens", detail: "Hausse moyenne après repositionnement." },
    { value: "34h", label: "Délai médian", detail: "Cadence opérationnelle sur tiers premium." },
    { value: "16k+", label: "Profils accompagnés", detail: "Des collaborateurs jusqu’aux mandats EVP." },
  ],
};

const countries = {
  en: [
    { country: "Canada", line: "Bilingual federal + provincial nuance packs." },
    { country: "United States", line: "Revenue narrative clarity for hyperscale hiring pods." },
    { country: "United Kingdom", line: "Competency-aligned structures for regulated industries." },
    { country: "France", line: "Sophisticated FR tone with Anglo cross-over fluency." },
    { country: "UAE", line: "Luxury-sector vocabulary for regional leadership searches." },
    { country: "Germany", line: "Precision KPI storytelling for Mittelstand + DAX hybrids." },
    { country: "Singapore", line: "APAC finance & tech recruiter expectations baked in." },
    { country: "Australia", line: "Straightforward proof stacks for pragmatic hiring cultures." },
  ],
  fr: [
    { country: "Canada", line: "Variantes bilingues fédérales et provinciales." },
    { country: "États-Unis", line: "Narratif chiffres pour recruteurs hyperscale." },
    { country: "Royaume-Uni", line: "Structures compétences pour secteurs réglementés." },
    { country: "France", line: "FR sophistiqué avec bascules anglo fluides." },
    { country: "EAU", line: "Vocabulaire luxe pour recherche régionale de cadres." },
    { country: "Allemagne", line: "Storytelling KPI pour Mittelstand et groupes cotés." },
    { country: "Singapour", line: "Attentes recruteur finance et tech APAC." },
    { country: "Australie", line: "Preuves directes pour cultures d’embauche pragmatiques." },
  ],
};

export default function HomePage() {
  const [lang, setLang] = useState("en");
  const [uploadStatus, setUploadStatus] = useState("");
  const [busyPlan, setBusyPlan] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);

  const t = translations[lang];
  const why = whyBullets(lang);
  const steps = processSteps(lang);
  const shields = securityItems(lang);

  const dynamicPlans = useMemo(
    () =>
      pricingPlans.map((plan) => ({
        ...plan,
        priceId: process.env[plan.env] || "",
      })),
    []
  );

  const handleCheckout = async (priceId, planId) => {
    if (!priceId) {
      alert("Missing Stripe price ID configuration for this plan.");
      return;
    }
    setBusyPlan(planId);
    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId }),
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

  const navLinks = (
    <>
      <a href="#why" onClick={() => setMenuOpen(false)}>
        {t.navWhy}
      </a>
      <a href="#services" onClick={() => setMenuOpen(false)}>
        {t.navServices}
      </a>
      <a href="#pricing" onClick={() => setMenuOpen(false)}>
        {t.navPricing}
      </a>
      <a href="#upload" onClick={() => setMenuOpen(false)}>
        {t.navUpload}
      </a>
      <a href="#countries" onClick={() => setMenuOpen(false)}>
        {t.navCountries}
      </a>
      <a href="#performance" onClick={() => setMenuOpen(false)}>
        {t.navPerformance}
      </a>
      <Link href="/contact" onClick={() => setMenuOpen(false)}>
        {t.navContact}
      </Link>
    </>
  );

  return (
    <div className="page">
      <div className="bgMesh" aria-hidden />
      <div className="bgGrid" aria-hidden />

      <header className="siteHeader">
        <div className="headerInner">
          <Link href="/" className="brand" aria-label="Resumora home">
            <img src="/resumora-logo.svg" alt="" width={280} height={60} className="logoImg" />
            <div className="brandLockup">
              <span className="brandWord">RESUMORA</span>
              <span className="brandSub">{t.logoTagline}</span>
            </div>
          </Link>

          <nav className="navDesktop" aria-label="Primary">
            {navLinks}
          </nav>

          <div className="headerTools">
            <button
              type="button"
              className={`langBtn ${lang === "en" ? "active" : ""}`}
              onClick={() => setLang("en")}
              aria-pressed={lang === "en"}
            >
              EN
            </button>
            <button
              type="button"
              className={`langBtn ${lang === "fr" ? "active" : ""}`}
              onClick={() => setLang("fr")}
              aria-pressed={lang === "fr"}
            >
              FR
            </button>
            <Link href="/login" className="ghostBtn hideMobile">
              {t.navLogin}
            </Link>
            <Link href="/register" className="goldBtn hideMobile">
              {t.navRegister}
            </Link>
            <button
              type="button"
              className="mobileToggle"
              onClick={() => setMenuOpen((v) => !v)}
              aria-expanded={menuOpen}
              aria-label={menuOpen ? t.closeMenu : t.openMenu}
            >
              {menuOpen ? <X {...ICON_WRAP} /> : <Menu {...ICON_WRAP} />}
            </button>
          </div>
        </div>

        {menuOpen && (
          <div className="mobileNavPanel">
            <nav className="navMobile">{navLinks}</nav>
            <div className="mobileAuth">
              <Link href="/login" className="ghostBtn blockBtn">
                {t.navLogin}
              </Link>
              <Link href="/register" className="goldBtn blockBtn">
                {t.navRegister}
              </Link>
            </div>
          </div>
        )}
      </header>

      <main className="content">
        <section className="heroSection">
          <div className="heroCopy">
            <p className="kicker">
              <Crown size={14} color={GOLD} strokeWidth={1.5} aria-hidden /> {t.heroKicker}
            </p>
            <h1>{t.heroHeadline}</h1>
            <p className="heroLead">{t.heroSubtitle}</p>
            <div className="heroActions">
              <a href="#pricing" className="goldBtn heroBtn">
                {t.heroPrimary}
              </a>
              <a href="#upload" className="ghostBtn heroBtn">
                {t.heroSecondary}
              </a>
            </div>
            <div className="trustBadges">
              <span>{t.trustA}</span>
              <span>{t.trustB}</span>
              <span>{t.trustC}</span>
            </div>
          </div>
          <aside className="heroAside" aria-label={t.heroPanelTitle}>
            <div className="heroCard glow">
              <p className="heroCardEyebrow">{t.heroPanelTitle}</p>
              <p className="heroCardMuted">{t.heroPanelSubtitle}</p>
              <ul className="heroList">
                <li>
                  <CheckCircle2 size={18} color={GOLD} /> {t.heroLine1}
                </li>
                <li>
                  <CheckCircle2 size={18} color={GOLD} /> {t.heroLine2}
                </li>
                <li>
                  <CheckCircle2 size={18} color={GOLD} /> {t.heroLine3}
                </li>
              </ul>
              <div className="resumeMock">
                <div className="mockBar" />
                <div className="mockLines">
                  <span />
                  <span />
                  <span className="short" />
                  <span />
                </div>
              </div>
            </div>
          </aside>
        </section>

        <section className="marquee" aria-hidden>
          <div className="marqueeFade" />
          <p className="marqueeLabel">{t.marqueeTitle}</p>
          <div className="marqueeTrack">
            {[...t.marqueeItems, ...t.marqueeItems].map((item, idx) => (
              <span key={`${idx}-${item}`}>{item}</span>
            ))}
          </div>
        </section>

        <section id="why" className="panel elevate">
          <div className="panelHead">
            <h2>{t.whyTitle}</h2>
            <p className="sectionSubtitle">{t.whySubtitle}</p>
          </div>
          <div className="whyGrid">
            {why.map(({ title, text, Icon }) => (
              <article className="card whyCard" key={title}>
                <div className="iconRail">
                  <Icon {...ICON_WRAP} />
                </div>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panelHead">
            <h2>{t.processTitle}</h2>
            <p className="sectionSubtitle">{t.processSubtitle}</p>
          </div>
          <div className="processGrid">
            {steps.map(({ title, detail, step, Icon }) => (
              <article className="processCard" key={step}>
                <span className="stepBadge">{step}</span>
                <Icon {...ICON_WRAP} />
                <h3>{title}</h3>
                <p>{detail}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="panel security">
          <div className="panelHead split">
            <div>
              <h2>{t.securityTitle}</h2>
              <p className="sectionSubtitle">{t.securitySubtitle}</p>
            </div>
            <ShieldCheck size={40} color={GOLD} strokeWidth={1.2} className="shieldArt" aria-hidden />
          </div>
          <div className="securityGrid">
            {shields.map(({ title, detail, Icon }) => (
              <article className="card securityCard" key={title}>
                <Icon {...ICON_WRAP} />
                <h3>{title}</h3>
                <p>{detail}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="upload" className="panel uploadPanel bordered">
          <div className="uploadGrid">
            <div>
              <h2>{t.uploadTitle}</h2>
              <p>{t.uploadText}</p>
              <small>{t.uploadHint}</small>
            </div>
            <form className="uploadShell" onSubmit={handleUpload}>
              <label className="fileLabel">
                <input name="resumeFile" type="file" accept=".pdf,.doc,.docx" required className="fileInput" />
                <span className="fileCue">
                  <FileText {...ICON_WRAP} /> PDF · DOC · DOCX
                </span>
              </label>
              <button type="submit" className="goldBtn stretch">
                {t.uploadButton}
              </button>
            </form>
          </div>
          {uploadStatus && <p className="status">{uploadStatus}</p>}
        </section>

        <section id="services" className="panel">
          <div className="panelHead">
            <h2>{t.servicesTitle}</h2>
            <p className="sectionSubtitle">{t.servicesSubtitle}</p>
          </div>
          <div className="grid serviceGrid">
            {services[lang].map(({ title, description, Icon }) => (
              <article className="card serviceCard hoverLift" key={title}>
                <div className="serviceTop">
                  <span className="iconBubble">
                    <Icon {...ICON_WRAP} />
                  </span>
                  <h3>{title}</h3>
                </div>
                <p>{description}</p>
                <a href="#upload" className="ghostBtn">
                  {t.serviceAction}
                </a>
              </article>
            ))}
          </div>
        </section>

        <section id="pricing" className="panel">
          <div className="panelHead">
            <h2>{t.pricingTitle}</h2>
            <p className="sectionSubtitle">{t.pricingSubtitle}</p>
          </div>
          <div className="pricingGridWrap">
            {dynamicPlans.map((plan) => (
              <article
                className={`card pricingCard ${plan.featured ? "featured" : ""}`}
                key={plan.id}
              >
                {plan.featured && <div className="ribbon">{t.popular}</div>}
                <h3>{plan.name[lang]}</h3>
                <p className="price">
                  <span>{plan.price}</span>
                </p>
                <ul>
                  {plan.features[lang].map((feature) => (
                    <li key={feature}>{feature}</li>
                  ))}
                </ul>
                <button
                  type="button"
                  className="goldBtn stretch"
                  onClick={() => handleCheckout(plan.priceId, plan.id)}
                  disabled={busyPlan === plan.id}
                >
                  {busyPlan === plan.id ? t.processing : t.choosePlan}
                </button>
              </article>
            ))}
          </div>
        </section>

        <section id="performance" className="panel">
          <div className="panelHead">
            <h2>{t.performanceTitle}</h2>
            <p className="sectionSubtitle">{t.performanceSubtitle}</p>
          </div>
          <div className="statsGrid">
            {performanceStats[lang].map((stat) => (
              <article className="card statCard" key={stat.label}>
                <GaugeDecor />
                <h3>{stat.value}</h3>
                <h4>{stat.label}</h4>
                <p>{stat.detail}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="countries" className="panel">
          <div className="panelHead">
            <h2>{t.countriesTitle}</h2>
            <p className="sectionSubtitle">{t.countriesSubtitle}</p>
          </div>
          <div className="countriesGrid">
            {countries[lang].map(({ country, line }) => (
              <article className="card countryCard" key={country}>
                <Globe2 size={20} color={GOLD} strokeWidth={1.4} aria-hidden />
                <div>
                  <h3>{country}</h3>
                  <p>{line}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="ctaBand">
          <div>
            <h2>{t.ctaTitle}</h2>
            <p>{t.ctaSubtitle}</p>
          </div>
          <div className="ctaActions">
            <a href="#pricing" className="goldBtn">
              {t.ctaPrimary}
            </a>
            <Link href="/contact" className="ghostBtn">
              {t.ctaSecondary}
            </Link>
          </div>
        </section>
      </main>

      <footer className="siteFooter">
        <div className="footerGrid">
          <div className="footerBrandCol">
            <img src="/resumora-logo.svg" alt="" className="footerLogo" width={220} height={48} />
            <div className="footerLockup">
              <strong>RESUMORA</strong>
              <span>{t.logoTagline}</span>
            </div>
            <p>{t.footerTagline}</p>
          </div>
          <div>
            <p className="footerHeading">{t.footerColProduct}</p>
            <ul className="footerList">
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
                <a href="#countries">{t.footerCountries}</a>
              </li>
              <li>
                <a href="#performance">{t.footerPerformance}</a>
              </li>
            </ul>
          </div>
          <div>
            <p className="footerHeading">{t.footerColCompany}</p>
            <ul className="footerList">
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
                <a href="#why">{t.footerWhy}</a>
              </li>
            </ul>
          </div>
          <div>
            <p className="footerHeading">{t.footerColLegal}</p>
            <ul className="footerList">
              <li>
                <Link href="/terms">{t.footerTerms}</Link>
              </li>
              <li>
                <Link href="/privacy">{t.footerPrivacy}</Link>
              </li>
            </ul>
          </div>
        </div>
        <div className="footerBar">
          <p>{t.footerCopy}</p>
        </div>
      </footer>

      <style jsx>{`
        .page {
          position: relative;
          min-height: 100vh;
          color: #f8f5ee;
          font-family: "Inter", ui-sans-serif, system-ui, "Segoe UI", Arial, sans-serif;
          overflow-x: hidden;
        }

        .bgMesh {
          position: fixed;
          inset: 0;
          z-index: 0;
          background:
            radial-gradient(1200px circle at 10% -10%, rgba(83, 120, 255, 0.18), transparent 55%),
            radial-gradient(900px circle at 90% 10%, rgba(212, 175, 55, 0.12), transparent 50%),
            linear-gradient(165deg, #050b18 0%, #0a1638 42%, #040813 100%);
          pointer-events: none;
        }

        .bgGrid {
          position: fixed;
          inset: 0;
          z-index: 0;
          background-image: linear-gradient(rgba(212, 175, 55, 0.05) 1px, transparent 1px),
            linear-gradient(90deg, rgba(212, 175, 55, 0.05) 1px, transparent 1px);
          background-size: 72px 72px;
          mask-image: radial-gradient(ellipse 80% 60% at 50% -10%, black 38%, transparent 75%);
          pointer-events: none;
          opacity: 0.65;
        }

        .siteHeader {
          position: sticky;
          top: 0;
          z-index: 40;
          border-bottom: 1px solid rgba(212, 175, 55, 0.22);
          background: rgba(5, 10, 24, 0.78);
          backdrop-filter: blur(16px);
        }

        .headerInner {
          width: min(1600px, 96%);
          margin: 0 auto;
          display: grid;
          grid-template-columns: minmax(0, 340px) 1fr auto;
          gap: clamp(14px, 2vw, 28px);
          align-items: center;
          padding: 16px 0;
        }

        .brand {
          display: flex;
          align-items: center;
          gap: 14px;
          text-decoration: none;
          color: inherit;
        }

        .logoImg {
          width: min(290px, 34vw);
          height: auto;
          flex-shrink: 0;
        }

        .brandLockup {
          display: flex;
          flex-direction: column;
          gap: 2px;
          min-width: 0;
          border-left: 1px solid rgba(212, 175, 55, 0.35);
          padding-left: 14px;
        }

        .brandWord {
          font-weight: 800;
          letter-spacing: 0.18em;
          font-size: 0.92rem;
        }

        .brandSub {
          color: #d4af37;
          letter-spacing: 0.08em;
          font-size: 0.74rem;
          text-transform: uppercase;
        }

        .navDesktop {
          display: flex;
          justify-content: center;
          gap: clamp(14px, 1.9vw, 22px);
          flex-wrap: wrap;
          align-items: center;
        }

        .navDesktop :global(a),
        .navDesktop a {
          color: rgba(248, 245, 238, 0.86);
          text-decoration: none;
          font-weight: 650;
          font-size: 0.92rem;
        }

        .navDesktop :global(a):hover,
        .navDesktop a:hover {
          color: #f8f5ee;
        }

        .headerTools {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          align-items: center;
          justify-content: flex-end;
        }

        .mobileToggle {
          display: none;
          border-radius: 10px;
          border: 1px solid rgba(212, 175, 55, 0.45);
          background: rgba(6, 14, 33, 0.55);
          padding: 8px;
          cursor: pointer;
          color: #f8f5ee;
        }

        .mobileNavPanel {
          display: none;
          border-top: 1px solid rgba(212, 175, 55, 0.15);
          background: rgba(4, 8, 20, 0.96);
        }

        .navMobile {
          display: grid;
          gap: 14px;
          padding: 16px clamp(14px, 4vw, 24px);
        }

        .navMobile :global(a),
        .navMobile a {
          color: #f8f5ee;
          font-weight: 650;
          text-decoration: none;
        }

        .mobileAuth {
          display: flex;
          gap: 10px;
          padding: 8px clamp(14px, 4vw, 24px) 18px;
        }

        .content {
          position: relative;
          z-index: 1;
          width: min(1600px, 96%);
          margin: 0 auto;
          padding: clamp(26px, 4vw, 48px) 0 92px;
        }

        .heroSection {
          display: grid;
          grid-template-columns: minmax(0, 1.12fr) minmax(260px, 0.76fr);
          gap: clamp(28px, 4vw, 56px);
          align-items: start;
          padding-bottom: clamp(18px, 3vw, 36px);
        }

        .kicker {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          margin: 0 0 12px;
          font-size: 0.82rem;
          letter-spacing: 0.09em;
          text-transform: uppercase;
          color: #e7d099;
          font-weight: 700;
        }

        .heroCopy h1 {
          margin: 0;
          font-size: clamp(2.55rem, 5.8vw, 4.95rem);
          line-height: 1.03;
          letter-spacing: -0.03em;
          max-width: 18ch;
        }

        .heroLead {
          margin-top: clamp(14px, 2vw, 22px);
          max-width: 52ch;
          font-size: clamp(1.05rem, 1.42vw, 1.34rem);
          line-height: 1.74;
          color: #e4dbca;
        }

        .heroActions {
          margin-top: 26px;
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
        }

        .heroBtn {
          padding: 14px 24px;
          font-size: 1rem;
        }

        .trustBadges {
          margin-top: 22px;
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
        }

        .trustBadges span {
          border-radius: 999px;
          border: 1px solid rgba(212, 175, 55, 0.38);
          padding: 8px 15px;
          font-size: 0.82rem;
          font-weight: 650;
          background: rgba(8, 16, 40, 0.78);
          color: #f2dfbb;
        }

        .heroAside {
          align-self: stretch;
        }

        .heroCard {
          position: relative;
          border-radius: 22px;
          border: 1px solid rgba(212, 175, 55, 0.35);
          background: rgba(10, 20, 48, 0.78);
          padding: 22px 22px 18px;
          box-shadow:
            inset 0 1px rgba(255, 255, 255, 0.04),
            0 30px 60px rgba(0, 0, 0, 0.32);
          overflow: hidden;
        }

        .heroCard.glow::after {
          content: "";
          position: absolute;
          inset: auto -35% -40% auto;
          width: 220px;
          height: 220px;
          background: radial-gradient(circle, rgba(212, 175, 55, 0.24), transparent 65%);
          pointer-events: none;
        }

        .heroCardEyebrow {
          margin: 0;
          font-weight: 800;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          font-size: 0.72rem;
          color: #d4af37;
        }

        .heroCardMuted {
          margin: 6px 0 16px;
          color: #d5cbaf;
          font-size: 0.95rem;
        }

        .heroList {
          list-style: none;
          margin: 0;
          padding: 0;
          display: grid;
          gap: 10px;
        }

        .heroList li {
          display: flex;
          gap: 8px;
          align-items: center;
          font-size: 0.92rem;
          color: #efe7d9;
          font-weight: 600;
        }

        .resumeMock {
          margin-top: 18px;
          border-radius: 14px;
          border: 1px dashed rgba(212, 175, 55, 0.28);
          background: rgba(4, 8, 20, 0.55);
          padding: 14px;
        }

        .mockBar {
          height: 8px;
          width: 40%;
          border-radius: 6px;
          background: linear-gradient(90deg, #d4af37, rgba(248, 245, 238, 0.25));
          margin-bottom: 12px;
        }

        .mockLines span {
          display: block;
          height: 6px;
          border-radius: 4px;
          background: rgba(248, 245, 238, 0.12);
          margin-bottom: 8px;
          width: 100%;
        }

        .mockLines span.short {
          width: 68%;
        }

        .marquee {
          position: relative;
          margin: clamp(26px, 4vw, 44px) 0;
          border-radius: 16px;
          border: 1px solid rgba(212, 175, 55, 0.24);
          background: rgba(7, 12, 30, 0.65);
          padding: 14px 0;
          overflow: hidden;
        }

        .marqueeFade {
          position: absolute;
          inset: 0;
          background: linear-gradient(90deg, #050914 14%, transparent 40%, transparent 60%, #050914 88%);
          z-index: 1;
          pointer-events: none;
        }

        .marqueeLabel {
          position: relative;
          z-index: 2;
          margin: 0 0 6px clamp(22px, 3vw, 30px);
          font-size: 0.74rem;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          font-weight: 700;
          color: #dcb678;
        }

        .marqueeTrack {
          position: relative;
          z-index: 2;
          display: inline-flex;
          gap: clamp(42px, 7vw, 90px);
          padding-left: clamp(22px, 3vw, 30px);
          animation: marquee 28s linear infinite;
          white-space: nowrap;
        }

        .marqueeTrack span {
          font-weight: 650;
          color: rgba(248, 245, 238, 0.9);
          font-size: 0.9rem;
        }

        @keyframes marquee {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-50%);
          }
        }

        .panel {
          position: relative;
          margin-top: clamp(22px, 3vw, 32px);
          border-radius: 24px;
          border: 1px solid rgba(212, 175, 55, 0.28);
          background: rgba(10, 18, 46, 0.58);
          padding: clamp(24px, 3vw, 44px);
          box-shadow:
            inset 0 1px rgba(255, 255, 255, 0.03),
            0 25px 60px rgba(0, 0, 0, 0.3);
          backdrop-filter: blur(12px);
        }

        .panel.elevate {
          border-color: rgba(212, 175, 55, 0.38);
        }

        .panelHead h2 {
          margin: 0;
          font-size: clamp(1.6rem, 2.2vw, 2.1rem);
          color: #f5e9c9;
          letter-spacing: -0.02em;
        }

        .sectionSubtitle {
          margin: 10px 0 0;
          max-width: 68ch;
          line-height: 1.73;
          color: #dbd1ba;
          font-size: 1rem;
        }

        .whyGrid {
          margin-top: 22px;
          display: grid;
          gap: clamp(14px, 2vw, 18px);
          grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
        }

        .card {
          border-radius: 18px;
          border: 1px solid rgba(212, 175, 55, 0.28);
          background: rgba(8, 14, 36, 0.68);
          padding: 18px;
        }

        .card h3 {
          margin: 0;
          color: #f3e4c2;
          font-size: 1.05rem;
        }

        .card p {
          margin: 10px 0 0;
          color: #e8dfca;
          line-height: 1.62;
          font-size: 0.95rem;
        }

        .whyCard {
          position: relative;
          padding-left: 16px;
        }

        .iconRail {
          position: absolute;
          left: -2px;
          top: -4px;
        }

        .processGrid {
          margin-top: 22px;
          display: grid;
          gap: clamp(14px, 2vw, 18px);
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        }

        .processCard {
          border-radius: 18px;
          border: 1px solid rgba(212, 175, 55, 0.28);
          background: rgba(6, 12, 32, 0.65);
          padding: 18px;
          display: grid;
          gap: 10px;
        }

        .stepBadge {
          width: fit-content;
          font-size: 0.72rem;
          font-weight: 800;
          letter-spacing: 0.12em;
          color: #d4af37;
        }

        .security .panelHead.split {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 18px;
          align-items: start;
        }

        .shieldArt {
          opacity: 0.92;
          filter: drop-shadow(0 8px 20px rgba(212, 175, 55, 0.3));
        }

        .securityGrid {
          margin-top: 22px;
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 14px;
        }

        .securityCard {
          padding: 18px;
        }

        .uploadPanel.bordered {
          border-width: 1.5px;
          border-color: rgba(212, 175, 55, 0.42);
        }

        .uploadGrid {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(260px, 0.82fr);
          gap: clamp(18px, 3vw, 36px);
          align-items: start;
        }

        .uploadPanel small {
          display: inline-block;
          margin-top: 10px;
          color: #c9b082;
          font-size: 0.9rem;
        }

        .uploadShell {
          display: grid;
          gap: 12px;
        }

        .fileLabel {
          display: grid;
          gap: 8px;
        }

        .fileInput {
          width: 100%;
          padding: 12px;
          border-radius: 14px;
          border: 1px solid rgba(212, 175, 55, 0.32);
          background: rgba(4, 8, 20, 0.88);
          color: #efe7d9;
          font-weight: 600;
        }

        .fileCue {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: 0.82rem;
          color: #d5c596;
          font-weight: 650;
        }

        .status {
          margin-top: 14px;
          font-weight: 800;
          color: #f3ddb8;
        }

        .serviceGrid {
          margin-top: 22px;
          display: grid;
          gap: 16px;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        }

        .serviceCard {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .hoverLift {
          transition: transform 180ms ease, border-color 180ms ease, box-shadow 180ms ease;
        }

        .hoverLift:hover {
          transform: translateY(-3px);
          border-color: rgba(212, 175, 55, 0.45);
          box-shadow:
            inset 0 1px rgba(255, 255, 255, 0.04),
            0 28px 50px rgba(0, 0, 0, 0.32);
        }

        .serviceTop {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .iconBubble {
          display: grid;
          place-items: center;
          width: 44px;
          height: 44px;
          border-radius: 12px;
          border: 1px solid rgba(212, 175, 55, 0.35);
          background: rgba(6, 12, 34, 0.75);
          flex-shrink: 0;
        }

        .serviceCard h3 {
          margin: 0;
          font-size: 1.1rem;
        }

        .serviceCard p {
          flex: 1;
        }

        .pricingGridWrap {
          margin-top: 22px;
          display: grid;
          gap: 16px;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        }

        .pricingCard {
          position: relative;
          display: flex;
          flex-direction: column;
          gap: 12px;
          overflow: visible;
          padding-top: 22px;
        }

        .pricingCard.featured {
          border-color: rgba(212, 175, 55, 0.62);
          background: radial-gradient(circle at 50% -20%, rgba(212, 175, 55, 0.15), transparent 55%),
            rgba(11, 20, 50, 0.78);
          box-shadow:
            0 38px 80px rgba(0, 0, 0, 0.4),
            inset 0 1px rgba(255, 255, 255, 0.05);
          transform: scale(1.01);
          z-index: 2;
        }

        .ribbon {
          position: absolute;
          top: -10px;
          right: clamp(14px, 3vw, 22px);
          background: linear-gradient(120deg, #c8962b, #f4dfae);
          color: #0a122c;
          font-size: 0.72rem;
          font-weight: 800;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          padding: 6px 12px;
          border-radius: 999px;
        }

        .price {
          margin: 0;
          color: #d4af37;
          font-size: 2.15rem;
          font-weight: 900;
          letter-spacing: -0.02em;
        }

        .pricingCard ul {
          margin: 0;
          padding-left: 18px;
          color: #e9e0cf;
          line-height: 1.62;
          display: grid;
          gap: 6px;
        }

        .statsGrid {
          margin-top: 22px;
          display: grid;
          gap: 14px;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        }

        .statCard {
          position: relative;
          overflow: hidden;
          min-height: 168px;
        }

        .statCard h3 {
          margin: 8px 0 0;
          font-size: clamp(2rem, 2.9vw, 2.55rem);
          color: #d4af37;
        }

        .statCard h4 {
          margin: 6px 0 8px;
          font-weight: 800;
          color: #efe3c4;
          font-size: 1rem;
        }

        .statCard p {
          margin: 0;
          color: #dbd0b4;
          font-size: 0.9rem;
        }

        .countriesGrid {
          margin-top: 22px;
          display: grid;
          gap: 14px;
          grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
        }

        .countryCard {
          display: flex;
          gap: 12px;
          align-items: flex-start;
        }

        .countryCard h3 {
          margin: 0;
        }

        .countryCard p {
          margin-top: 4px;
          color: #ded4bc;
          font-size: 0.9rem;
        }

        .ctaBand {
          margin-top: clamp(28px, 4vw, 44px);
          border-radius: 22px;
          border: 1px solid rgba(212, 175, 55, 0.35);
          background: linear-gradient(120deg, rgba(212, 175, 55, 0.16), rgba(13, 24, 60, 0.85));
          padding: clamp(22px, 3vw, 34px);
          display: grid;
          grid-template-columns: minmax(0, 2fr) minmax(260px, 1fr);
          gap: 18px;
          align-items: center;
        }

        .ctaBand h2 {
          margin: 0;
          font-size: clamp(1.6rem, 2.6vw, 2.35rem);
        }

        .ctaBand p {
          margin: 8px 0 0;
          color: #f2ebe0;
          line-height: 1.65;
        }

        .ctaActions {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          justify-content: flex-end;
        }

        .siteFooter {
          position: relative;
          z-index: 2;
          border-top: 1px solid rgba(212, 175, 55, 0.22);
          background: rgba(4, 7, 18, 0.92);
        }

        .footerGrid {
          width: min(1600px, 96%);
          margin: 0 auto;
          display: grid;
          grid-template-columns: minmax(0, 2fr) repeat(3, minmax(0, 1fr));
          gap: clamp(26px, 4vw, 44px);
          padding: clamp(36px, 5vw, 56px) 0 clamp(22px, 3vw, 30px);
        }

        .footerBrandCol > p {
          margin: 12px 0 0;
          max-width: 44ch;
          color: #c8bc9d;
          line-height: 1.65;
        }

        .footerLogo {
          display: block;
          width: clamp(200px, 28vw, 260px);
          height: auto;
        }

        .footerLockup {
          margin-top: 10px;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .footerLockup strong {
          letter-spacing: 0.2em;
          font-size: 0.76rem;
        }

        .footerLockup span {
          color: #d4af37;
          letter-spacing: 0.06em;
          font-size: 0.74rem;
        }

        .footerHeading {
          margin: 0 0 10px;
          font-weight: 800;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          font-size: 0.76rem;
          color: #e5cf96;
        }

        .footerList {
          margin: 0;
          padding: 0;
          list-style: none;
          display: grid;
          gap: 8px;
        }

        .footerList :global(a),
        .footerList a {
          color: rgba(248, 245, 238, 0.9);
          text-decoration: none;
          font-weight: 630;
          font-size: 0.95rem;
        }

        .footerList :global(a):hover,
        .footerList a:hover {
          color: #ffffff;
        }

        .footerBar {
          width: min(1600px, 96%);
          margin: 0 auto;
          border-top: 1px solid rgba(212, 175, 55, 0.16);
          padding: 14px 0 24px;
        }

        .footerBar p {
          margin: 0;
          font-size: 0.82rem;
          color: #a89b7b;
          text-align: center;
        }

        .goldBtn,
        .ghostBtn {
          border-radius: 11px;
          border: 1px solid transparent;
          padding: 10px 16px;
          cursor: pointer;
          text-decoration: none;
          font-weight: 800;
          font-size: 0.92rem;
          transition:
            transform 150ms ease,
            box-shadow 150ms ease;
        }

        .goldBtn {
          background: linear-gradient(120deg, #c8962b, #f6dfae);
          color: #0a122c;
          border-color: rgba(248, 210, 120, 0.75);
          box-shadow: 0 12px 24px rgba(200, 150, 40, 0.25);
        }

        .ghostBtn {
          background: rgba(6, 12, 32, 0.55);
          color: #f8f5ee;
          border-color: rgba(212, 175, 55, 0.45);
        }

        .goldBtn:hover {
          transform: translateY(-1px);
        }

        .langBtn {
          border-radius: 9px;
          border: 1px solid rgba(212, 175, 55, 0.45);
          background: rgba(6, 12, 34, 0.55);
          color: #f8f5ee;
          cursor: pointer;
          font-weight: 800;
          padding: 7px 10px;
        }

        .langBtn.active {
          background: rgba(212, 175, 55, 0.24);
          color: #fff;
        }

        .stretch {
          width: 100%;
          justify-content: center;
        }

        .blockBtn {
          flex: 1;
          text-align: center;
          display: inline-block;
          box-sizing: border-box;
          width: 100%;
          max-width: none;
        }

        .hideMobile {
          display: inline-flex;
        }

        @media (max-width: 1200px) {
          .brandLockup {
            display: none;
          }

          .headerInner {
            grid-template-columns: 1fr auto;
          }

          .navDesktop {
            display: none;
          }

          .mobileToggle {
            display: grid;
          }

          .mobileNavPanel {
            display: block;
          }

          .hideMobile {
            display: none;
          }

          .heroSection {
            grid-template-columns: 1fr;
          }

          .footerGrid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .security .panelHead.split {
            grid-template-columns: 1fr;
          }

          .shieldArt {
            display: none;
          }
        }

        @media (max-width: 768px) {
          .ctaBand {
            grid-template-columns: 1fr;
          }

          .ctaActions {
            justify-content: flex-start;
          }

          .uploadGrid {
            grid-template-columns: 1fr;
          }

          .footerGrid {
            grid-template-columns: 1fr;
          }

          .heroCopy h1 {
            max-width: none;
          }
        }
      `}</style>
    </div>
  );
}

function GaugeDecor() {
  const gradId = `gg-${useId().replace(/\W/g, "")}`;
  return (
    <div className="gauge" aria-hidden>
      <svg width={58} height={28} viewBox="0 0 58 28" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M 3 26 Q 29 6 55 26"
          fill="none"
          stroke="rgba(212,175,55,0.25)"
          strokeWidth="4"
          strokeLinecap="round"
        />
        <path
          d="M 5 26 Q 29 11 53 26"
          fill="none"
          stroke={`url(#${gradId})`}
          strokeWidth="5"
          strokeLinecap="round"
        />
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#8a6f24" />
            <stop offset="100%" stopColor="#f6dfae" />
          </linearGradient>
        </defs>
      </svg>
      <style jsx>{`
        .gauge {
          position: absolute;
          top: 10px;
          right: 12px;
        }
      `}</style>
    </div>
  );
}
