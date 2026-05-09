import { useMemo, useState } from "react";
import Link from "next/link";

const translations = {
  en: {
    navServices: "Services",
    navPricing: "Pricing",
    navUpload: "Upload",
    navCountries: "Countries",
    navPerformance: "Performance",
    navContact: "Contact",
    navLogin: "Login",
    navRegister: "Register",
    logoTagline: "Premium Career Studio",
    heroHeadline: "Luxury Career Positioning for Global Professionals",
    heroSubtitle:
      "Resumora combines executive writing, ATS intelligence, and recruiter strategy to elevate your profile and accelerate interviews worldwide.",
    heroPrimary: "Start Premium Plan",
    heroSecondary: "Upload Resume / CV",
    trustA: "Trusted by 16,000+ Professionals",
    trustB: "98.2% Client Satisfaction",
    trustC: "Delivery in 34 Hours Average",
    uploadTitle: "Upload Your Resume / CV",
    uploadText:
      "Submit your current resume for a confidential premium review. Our specialists evaluate ATS score, recruiter readability, and market positioning before recommending the best plan.",
    uploadButton: "Upload Document",
    uploadSuccess: "Upload completed successfully.",
    uploadError: "Upload failed. Please try again.",
    uploadHint: "Accepted formats: PDF, DOC, DOCX.",
    servicesTitle: "Premium Services",
    servicesSubtitle:
      "Each service is structured for measurable hiring outcomes and delivered with white-glove support.",
    serviceAction: "View Service",
    pricingTitle: "Pricing Plans",
    pricingSubtitle:
      "Choose the package aligned with your career goals, urgency, and target market.",
    choosePlan: "Choose Plan",
    processing: "Processing...",
    performanceTitle: "Performance & Results",
    performanceSubtitle:
      "Our outcomes are built on quality, speed, and global hiring expertise.",
    countriesTitle: "Global Reach",
    countriesSubtitle:
      "We prepare profiles for local and international hiring standards across key markets.",
    footerAbout: "About",
    footerServices: "Services",
    footerTerms: "Terms",
    footerPrivacy: "Privacy",
    footerSupport: "Support",
    footerContact: "Contact",
    footerCopy: "Copyright 2026 Resumora. All rights reserved.",
  },
  fr: {
    navServices: "Services",
    navPricing: "Tarifs",
    navUpload: "Televersement",
    navCountries: "Pays",
    navPerformance: "Performance",
    navContact: "Contact",
    navLogin: "Connexion",
    navRegister: "Inscription",
    logoTagline: "Studio Carriere Premium",
    heroHeadline: "Positionnement Carriere Haut de Gamme pour Talents Mondiaux",
    heroSubtitle:
      "Resumora combine redaction executive, intelligence ATS et strategie recruteur pour valoriser votre profil et accelerer vos entretiens a l international.",
    heroPrimary: "Demarrer le Plan Premium",
    heroSecondary: "Televerser CV / Resume",
    trustA: "Fait confiance par plus de 16 000 professionnels",
    trustB: "98.2% de satisfaction client",
    trustC: "Livraison en 34 heures en moyenne",
    uploadTitle: "Televersez Votre CV / Resume",
    uploadText:
      "Soumettez votre CV pour une revue premium confidentielle. Nos specialistes analysent le score ATS, la lisibilite recruteur et le positionnement marche avant de recommander le meilleur plan.",
    uploadButton: "Televerser le document",
    uploadSuccess: "Televersement termine avec succes.",
    uploadError: "Echec du televersement. Veuillez reessayer.",
    uploadHint: "Formats acceptes: PDF, DOC, DOCX.",
    servicesTitle: "Services Premium",
    servicesSubtitle:
      "Chaque service est concu pour des resultats mesurables et livre avec un accompagnement haut de gamme.",
    serviceAction: "Voir le service",
    pricingTitle: "Plans Tarifaires",
    pricingSubtitle:
      "Choisissez la formule adaptee a vos objectifs de carriere, votre urgence et votre marche cible.",
    choosePlan: "Choisir le plan",
    processing: "Traitement...",
    performanceTitle: "Performance et Resultats",
    performanceSubtitle:
      "Nos resultats reposent sur la qualite, la rapidite et une expertise recrutement internationale.",
    countriesTitle: "Portee Internationale",
    countriesSubtitle:
      "Nous preparons les profils selon les standards de recrutement locaux et internationaux.",
    footerAbout: "A propos",
    footerServices: "Services",
    footerTerms: "Conditions",
    footerPrivacy: "Confidentialite",
    footerSupport: "Support",
    footerContact: "Contact",
    footerCopy: "Copyright 2026 Resumora. Tous droits reserves.",
  },
};

const services = {
  en: [
    {
      title: "ATS Resume Optimization",
      description:
        "Complete resume refinement with role-specific keywords, modern structure, and ATS alignment to maximize screening visibility.",
    },
    {
      title: "Cover Letter Generator",
      description:
        "Tailored cover letters built around your experience and target role, crafted to communicate immediate professional value.",
    },
    {
      title: "LinkedIn Optimization",
      description:
        "Premium LinkedIn profile enhancement for headline, about section, achievements, and recruiter search discoverability.",
    },
    {
      title: "Interview Preparation",
      description:
        "Strategic preparation with high-impact responses, executive storytelling, and confidence frameworks for key interviews.",
    },
    {
      title: "Translation / TLS",
      description:
        "Bilingual translation and language support for English and French applications with consistent professional tone.",
    },
    {
      title: "Priority Support",
      description:
        "Fast-track revisions and dedicated advisor assistance to ensure your documents are polished before submission.",
    },
  ],
  fr: [
    {
      title: "Optimisation CV ATS",
      description:
        "Refonte complete du CV avec mots-cles cibles, structure moderne et alignement ATS pour renforcer la visibilite.",
    },
    {
      title: "Generateur de Lettre",
      description:
        "Lettres de motivation personnalisees selon votre experience et le poste vise pour communiquer une valeur immediate.",
    },
    {
      title: "Optimisation LinkedIn",
      description:
        "Amelioration premium du profil LinkedIn: titre, resume, realisations et visibilite dans les recherches recruteur.",
    },
    {
      title: "Preparation Entretien",
      description:
        "Preparation strategique avec reponses percutantes, narration executive et methodes de confiance pour vos entretiens.",
    },
    {
      title: "Traduction / TLS",
      description:
        "Support bilingue anglais-francais pour candidatures avec ton professionnel coherent et convaincant.",
    },
    {
      title: "Support Prioritaire",
      description:
        "Revisions accelerees et accompagnement dedie afin de finaliser vos documents avant candidature.",
    },
  ],
};

const pricingPlans = [
  {
    id: "basic",
    name: { en: "Basic", fr: "Basic" },
    price: "$19",
    env: "NEXT_PUBLIC_STRIPE_PRICE_STARTER",
    features: {
      en: [
        "ATS resume scan and targeted fixes",
        "Professional formatting refresh",
        "Keyword calibration by industry",
        "1 revision cycle",
      ],
      fr: [
        "Analyse ATS et corrections ciblees",
        "Mise en forme professionnelle",
        "Calibration mots-cles par secteur",
        "1 cycle de revision",
      ],
    },
  },
  {
    id: "professional",
    name: { en: "Professional", fr: "Professionnel" },
    price: "$49",
    env: "NEXT_PUBLIC_STRIPE_PRICE_PRO",
    features: {
      en: [
        "Everything in Basic",
        "Full resume rewrite",
        "Custom cover letter creation",
        "2 revision cycles and priority handling",
      ],
      fr: [
        "Tout le contenu du plan Basic",
        "Reecriture complete du CV",
        "Creation de lettre personnalisee",
        "2 cycles de revision et priorite",
      ],
    },
  },
  {
    id: "elite",
    name: { en: "Elite", fr: "Elite" },
    price: "$99",
    env: "NEXT_PUBLIC_STRIPE_PRICE_ELITE",
    features: {
      en: [
        "Everything in Professional",
        "LinkedIn profile optimization",
        "Interview preparation session",
        "Priority concierge support",
      ],
      fr: [
        "Tout le contenu du plan Professionnel",
        "Optimisation complete LinkedIn",
        "Session de preparation entretien",
        "Support concierge prioritaire",
      ],
    },
  },
];

const performanceStats = {
  en: [
    { value: "98.2%", label: "Client satisfaction" },
    { value: "4.7x", label: "Interview rate increase" },
    { value: "34h", label: "Average delivery" },
    { value: "16k+", label: "Professionals supported" },
  ],
  fr: [
    { value: "98.2%", label: "Satisfaction client" },
    { value: "4.7x", label: "Hausse du taux d entretien" },
    { value: "34h", label: "Delai moyen de livraison" },
    { value: "16k+", label: "Professionnels accompagnes" },
  ],
};

const countries = {
  en: [
    "Canada",
    "United States",
    "United Kingdom",
    "France",
    "UAE",
    "Germany",
    "Singapore",
    "Australia",
  ],
  fr: [
    "Canada",
    "Etats-Unis",
    "Royaume-Uni",
    "France",
    "EAU",
    "Allemagne",
    "Singapour",
    "Australie",
  ],
};

export default function HomePage() {
  const [lang, setLang] = useState("en");
  const [uploadStatus, setUploadStatus] = useState("");
  const [busyPlan, setBusyPlan] = useState("");
  const t = translations[lang];

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

  return (
    <div className="page">
      <header className="header">
        <div className="brand">
          <img src="/resumora-logo.svg" alt="Resumora" className="logo" />
          <div className="brandText">
            <span className="name">RESUMORA</span>
            <span className="tagline">{t.logoTagline}</span>
          </div>
        </div>

        <nav className="nav">
          <a href="#services">{t.navServices}</a>
          <a href="#pricing">{t.navPricing}</a>
          <a href="#upload">{t.navUpload}</a>
          <a href="#countries">{t.navCountries}</a>
          <a href="#performance">{t.navPerformance}</a>
          <Link href="/contact">{t.navContact}</Link>
        </nav>

        <div className="headerActions">
          <button
            type="button"
            className={`langBtn ${lang === "en" ? "active" : ""}`}
            onClick={() => setLang("en")}
          >
            EN
          </button>
          <button
            type="button"
            className={`langBtn ${lang === "fr" ? "active" : ""}`}
            onClick={() => setLang("fr")}
          >
            FR
          </button>
          <Link href="/login" className="ghostBtn">
            {t.navLogin}
          </Link>
          <Link href="/register" className="goldBtn">
            {t.navRegister}
          </Link>
        </div>
      </header>

      <main className="content">
        <section className="hero">
          <h1>{t.heroHeadline}</h1>
          <p>{t.heroSubtitle}</p>
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
        </section>

        <section id="upload" className="panel uploadPanel">
          <div>
            <h2>{t.uploadTitle}</h2>
            <p>{t.uploadText}</p>
            <small>{t.uploadHint}</small>
          </div>
          <form className="uploadForm" onSubmit={handleUpload}>
            <input name="resumeFile" type="file" accept=".pdf,.doc,.docx" required />
            <button type="submit" className="goldBtn">
              {t.uploadButton}
            </button>
          </form>
          {uploadStatus && <p className="status">{uploadStatus}</p>}
        </section>

        <section id="services" className="panel">
          <h2>{t.servicesTitle}</h2>
          <p className="sectionSubtitle">{t.servicesSubtitle}</p>
          <div className="grid serviceGrid">
            {services[lang].map((service) => (
              <article className="card serviceCard" key={service.title}>
                <h3>{service.title}</h3>
                <p>{service.description}</p>
                <a href="#upload" className="ghostBtn">
                  {t.serviceAction}
                </a>
              </article>
            ))}
          </div>
        </section>

        <section id="pricing" className="panel">
          <h2>{t.pricingTitle}</h2>
          <p className="sectionSubtitle">{t.pricingSubtitle}</p>
          <div className="grid pricingGrid">
            {dynamicPlans.map((plan) => (
              <article className="card pricingCard" key={plan.id}>
                <h3>{plan.name[lang]}</h3>
                <p className="price">{plan.price}</p>
                <ul>
                  {plan.features[lang].map((feature) => (
                    <li key={feature}>{feature}</li>
                  ))}
                </ul>
                <button
                  type="button"
                  className="goldBtn"
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
          <h2>{t.performanceTitle}</h2>
          <p className="sectionSubtitle">{t.performanceSubtitle}</p>
          <div className="grid statsGrid">
            {performanceStats[lang].map((stat) => (
              <article className="card statCard" key={stat.label}>
                <h3>{stat.value}</h3>
                <p>{stat.label}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="countries" className="panel">
          <h2>{t.countriesTitle}</h2>
          <p className="sectionSubtitle">{t.countriesSubtitle}</p>
          <div className="grid countriesGrid">
            {countries[lang].map((country) => (
              <article className="card countryCard" key={country}>
                <h3>{country}</h3>
              </article>
            ))}
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="footerTop">
          <Link href="/about">{t.footerAbout}</Link>
          <a href="#services">{t.footerServices}</a>
          <Link href="/terms">{t.footerTerms}</Link>
          <Link href="/privacy">{t.footerPrivacy}</Link>
          <Link href="/support">{t.footerSupport}</Link>
          <Link href="/contact">{t.footerContact}</Link>
        </div>
        <p>{t.footerCopy}</p>
      </footer>

      <style jsx>{`
        .page {
          min-height: 100vh;
          background: radial-gradient(circle at top, #172f64 0%, #0a1531 54%, #050b18 100%);
          color: #f8f5ee;
          font-family: "Inter", "Segoe UI", Arial, sans-serif;
        }

        .header {
          width: min(1600px, 96%);
          margin: 0 auto;
          padding: 30px 0 20px;
          display: grid;
          grid-template-columns: auto 1fr auto;
          gap: 24px;
          align-items: center;
        }

        .brand {
          display: flex;
          align-items: center;
          gap: 14px;
        }

        .logo {
          width: clamp(220px, 22vw, 320px);
          height: auto;
          max-width: 100%;
        }

        .brandText {
          display: none;
        }

        .name {
          font-weight: 800;
          letter-spacing: 0.08em;
        }

        .tagline {
          color: #d4af37;
          font-size: 0.82rem;
          text-transform: uppercase;
          letter-spacing: 0.12em;
        }

        .nav {
          display: flex;
          justify-content: center;
          align-items: center;
          flex-wrap: wrap;
          gap: 20px;
        }

        .nav :global(a),
        .nav a {
          color: #f8f5ee;
          text-decoration: none;
          font-weight: 600;
          opacity: 0.92;
        }

        .nav :global(a):hover,
        .nav a:hover {
          opacity: 1;
        }

        .headerActions {
          display: flex;
          flex-wrap: wrap;
          justify-content: flex-end;
          gap: 10px;
        }

        .content {
          width: min(1600px, 96%);
          margin: 0 auto;
          padding: 16px 0 84px;
        }

        .hero {
          padding: 50px 0 36px;
        }

        .hero h1 {
          margin: 0;
          max-width: 1150px;
          font-size: clamp(2.4rem, 5vw, 4.8rem);
          line-height: 1.05;
          letter-spacing: -0.02em;
        }

        .hero p {
          margin: 18px 0 0;
          max-width: 980px;
          color: #e9e3d3;
          font-size: clamp(1.04rem, 1.5vw, 1.3rem);
          line-height: 1.8;
        }

        .heroActions {
          margin-top: 24px;
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
        }

        .heroBtn {
          padding: 14px 22px;
          font-size: 1rem;
        }

        .trustBadges {
          margin-top: 22px;
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
        }

        .trustBadges span {
          border: 1px solid rgba(212, 175, 55, 0.42);
          border-radius: 999px;
          padding: 8px 14px;
          background: rgba(8, 18, 40, 0.75);
          color: #f2dfb7;
          font-size: 0.9rem;
          font-weight: 600;
        }

        .panel {
          margin-top: 24px;
          border: 1px solid rgba(212, 175, 55, 0.3);
          border-radius: 22px;
          background: linear-gradient(140deg, rgba(8, 16, 37, 0.92), rgba(10, 20, 47, 0.82));
          padding: clamp(24px, 2.4vw, 40px);
          box-shadow: 0 20px 55px rgba(0, 0, 0, 0.3);
        }

        .panel h2 {
          margin: 0;
          color: #f5e3ba;
          font-size: clamp(1.5rem, 2vw, 2rem);
        }

        .panel p {
          margin: 12px 0 0;
          line-height: 1.75;
          color: #e8e0cc;
        }

        .sectionSubtitle {
          max-width: 960px;
        }

        .uploadPanel small {
          display: inline-block;
          margin-top: 10px;
          color: #ceb988;
          font-size: 0.92rem;
        }

        .uploadForm {
          margin-top: 18px;
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
        }

        .uploadForm input {
          min-width: 320px;
          max-width: 100%;
          padding: 11px 12px;
          color: #f8f5ee;
          background: rgba(5, 13, 31, 0.82);
          border: 1px solid rgba(212, 175, 55, 0.32);
          border-radius: 10px;
        }

        .status {
          margin-top: 12px;
          color: #f4ddb0;
          font-weight: 700;
        }

        .grid {
          margin-top: 20px;
          display: grid;
          gap: 16px;
        }

        .serviceGrid {
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        }

        .pricingGrid {
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        }

        .statsGrid,
        .countriesGrid {
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        }

        .card {
          border: 1px solid rgba(212, 175, 55, 0.3);
          border-radius: 16px;
          background: rgba(10, 19, 44, 0.72);
          padding: 18px;
        }

        .card h3 {
          margin: 0;
          color: #f3dfb4;
          font-size: 1.15rem;
        }

        .card p {
          margin-top: 10px;
          color: #e8dfca;
          line-height: 1.65;
        }

        .serviceCard .ghostBtn {
          margin-top: 14px;
          display: inline-flex;
          width: fit-content;
        }

        .pricingCard {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .price {
          margin: 2px 0 0;
          color: #d4af37;
          font-size: 2rem;
          font-weight: 800;
        }

        .pricingCard ul {
          margin: 0;
          padding-left: 18px;
          display: grid;
          gap: 8px;
          color: #e6dec9;
          line-height: 1.55;
        }

        .pricingCard button {
          margin-top: auto;
        }

        .statCard {
          min-height: 150px;
        }

        .statCard h3 {
          color: #d4af37;
          font-size: clamp(1.9rem, 2.8vw, 2.4rem);
        }

        .countryCard {
          min-height: 96px;
          display: flex;
          align-items: center;
        }

        .footer {
          border-top: 1px solid rgba(212, 175, 55, 0.24);
          width: min(1600px, 96%);
          margin: 0 auto;
          padding: 30px 0 34px;
        }

        .footerTop {
          display: flex;
          flex-wrap: wrap;
          gap: 16px;
          margin-bottom: 12px;
        }

        .footerTop :global(a),
        .footerTop a {
          color: #f8f5ee;
          text-decoration: none;
          font-weight: 600;
          opacity: 0.92;
        }

        .footerTop :global(a):hover,
        .footerTop a:hover {
          opacity: 1;
        }

        .footer p {
          margin: 0;
          color: #ddcfab;
          font-size: 0.94rem;
        }

        .goldBtn,
        .ghostBtn,
        .langBtn {
          border-radius: 10px;
          border: 1px solid transparent;
          padding: 10px 14px;
          cursor: pointer;
          text-decoration: none;
          font-weight: 700;
          font-size: 0.94rem;
          transition: all 0.2s ease;
        }

        .goldBtn {
          background: linear-gradient(120deg, #cfa534, #f6dfae);
          color: #08112c;
          border-color: rgba(212, 175, 55, 0.78);
        }

        .ghostBtn,
        .langBtn {
          background: rgba(6, 14, 33, 0.45);
          color: #f8f5ee;
          border-color: rgba(212, 175, 55, 0.45);
        }

        .langBtn.active {
          background: rgba(212, 175, 55, 0.21);
        }

        @media (max-width: 1200px) {
          .header {
            grid-template-columns: 1fr;
            align-items: start;
            gap: 14px;
          }

          .nav {
            justify-content: flex-start;
          }

          .headerActions {
            justify-content: flex-start;
          }

          .brandText {
            display: flex;
            flex-direction: column;
          }
        }

        @media (max-width: 768px) {
          .content {
            width: 94%;
          }

          .header {
            width: 94%;
          }

          .footer {
            width: 94%;
          }

          .uploadForm input {
            min-width: 100%;
          }
        }
      `}</style>
    </div>
  );
}
