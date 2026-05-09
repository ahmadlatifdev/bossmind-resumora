import { useMemo, useState } from "react";
import Link from "next/link";

const translations = {
  en: {
    navLogin: "Login",
    navRegister: "Register",
    heroTitle: "Luxury Career Positioning for Global Talent",
    heroSubtitle:
      "Resumora combines elite writing, ATS strategy, and recruiter intelligence to elevate your profile and accelerate interviews worldwide.",
    heroPrimary: "Start Premium Plan",
    heroSecondary: "Upload Resume / CV",
    uploadTitle: "Upload Your Resume / CV",
    uploadSubtitle:
      "Securely submit your current profile. Our experts run a full ATS and recruiter-readability assessment.",
    uploadButton: "Upload Document",
    uploadSuccess: "Upload completed successfully.",
    uploadError: "Upload failed. Please try again.",
    servicesTitle: "Premium Services",
    statsTitle: "Trust & Performance",
    countriesTitle: "Global Reach",
    pricingTitle: "Choose Your Plan",
    choosePlan: "Choose Plan",
    processing: "Processing...",
    footerTerms: "Terms",
    footerPrivacy: "Privacy",
    footerContact: "Contact",
    footerSupport: "Support",
    footerAbout: "About",
  },
  fr: {
    navLogin: "Connexion",
    navRegister: "Inscription",
    heroTitle: "Positionnement de Carriere Haut de Gamme pour Talents Mondiaux",
    heroSubtitle:
      "Resumora combine redaction elite, strategie ATS et intelligence recruteur pour renforcer votre profil et accelerer vos entretiens dans le monde.",
    heroPrimary: "Demarrer le Plan Premium",
    heroSecondary: "Televerser CV / Resume",
    uploadTitle: "Televersez Votre CV / Resume",
    uploadSubtitle:
      "Envoyez votre profil en toute securite. Nos experts realisent une analyse complete ATS et lisibilite recruteur.",
    uploadButton: "Televerser le document",
    uploadSuccess: "Televersement termine avec succes.",
    uploadError: "Echec du televersement. Veuillez reessayer.",
    servicesTitle: "Services Premium",
    statsTitle: "Confiance & Performance",
    countriesTitle: "Portee Mondiale",
    pricingTitle: "Choisissez Votre Plan",
    choosePlan: "Choisir le plan",
    processing: "Traitement...",
    footerTerms: "Conditions",
    footerPrivacy: "Confidentialite",
    footerContact: "Contact",
    footerSupport: "Support",
    footerAbout: "A propos",
  },
};

const serviceItems = {
  en: [
    "ATS Resume",
    "Cover Letter",
    "LinkedIn Optimization",
    "Interview Preparation",
    "Translation / TLS",
    "Priority Support",
  ],
  fr: [
    "CV ATS",
    "Lettre de motivation",
    "Optimisation LinkedIn",
    "Preparation aux entretiens",
    "Traduction / TLS",
    "Support prioritaire",
  ],
};

const statItems = {
  en: [
    { value: "98.2%", label: "Client Satisfaction" },
    { value: "4.7x", label: "Interview Rate Increase" },
    { value: "34h", label: "Average Delivery Time" },
    { value: "16k+", label: "Professionals Supported" },
  ],
  fr: [
    { value: "98.2%", label: "Satisfaction client" },
    { value: "4.7x", label: "Hausse du taux d entretien" },
    { value: "34h", label: "Delai moyen de livraison" },
    { value: "16k+", label: "Professionnels accompagnes" },
  ],
};

const countryItems = [
  "Canada",
  "United States",
  "United Kingdom",
  "France",
  "UAE",
  "Germany",
  "Singapore",
  "Australia",
];

const plans = [
  {
    id: "starter",
    name: { en: "Starter", fr: "Essentiel" },
    price: "$79",
    desc: {
      en: "ATS resume optimization and precision formatting.",
      fr: "Optimisation CV ATS et formatage de precision.",
    },
    env: "NEXT_PUBLIC_STRIPE_PRICE_STARTER",
  },
  {
    id: "pro",
    name: { en: "Pro", fr: "Pro" },
    price: "$149",
    desc: {
      en: "Resume + cover letter + recruiter keyword strategy.",
      fr: "CV + lettre + strategie de mots-cles recruteur.",
    },
    env: "NEXT_PUBLIC_STRIPE_PRICE_PRO",
  },
  {
    id: "elite",
    name: { en: "Elite", fr: "Elite" },
    price: "$249",
    desc: {
      en: "Complete package with LinkedIn and interview prep.",
      fr: "Pack complet avec LinkedIn et preparation entretien.",
    },
    env: "NEXT_PUBLIC_STRIPE_PRICE_ELITE",
  },
];

export default function HomePage() {
  const [lang, setLang] = useState("en");
  const [uploadStatus, setUploadStatus] = useState("");
  const [busyPlan, setBusyPlan] = useState("");
  const t = translations[lang];

  const dynamicPlans = useMemo(
    () =>
      plans.map((plan) => ({
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
        <img src="/resumora-logo.svg" alt="Resumora" className="logo" />
        <div className="headerActions">
          <button
            className={`langBtn ${lang === "en" ? "active" : ""}`}
            onClick={() => setLang("en")}
          >
            EN
          </button>
          <button
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

      <main className="container">
        <section className="hero">
          <h1>{t.heroTitle}</h1>
          <p>{t.heroSubtitle}</p>
          <div className="heroActions">
            <a href="#pricing" className="goldBtn">
              {t.heroPrimary}
            </a>
            <a href="#upload" className="ghostBtn">
              {t.heroSecondary}
            </a>
          </div>
        </section>

        <section id="upload" className="panel">
          <h2>{t.uploadTitle}</h2>
          <p>{t.uploadSubtitle}</p>
          <form onSubmit={handleUpload} className="uploadForm">
            <input name="resumeFile" type="file" accept=".pdf,.doc,.docx" required />
            <button type="submit" className="goldBtn">
              {t.uploadButton}
            </button>
          </form>
          {uploadStatus && <p className="status">{uploadStatus}</p>}
        </section>

        <section className="panel">
          <h2>{t.servicesTitle}</h2>
          <div className="grid">
            {serviceItems[lang].map((service) => (
              <article key={service} className="card">
                <h3>{service}</h3>
              </article>
            ))}
          </div>
        </section>

        <section className="panel">
          <h2>{t.statsTitle}</h2>
          <div className="grid statsGrid">
            {statItems[lang].map((stat) => (
              <article key={stat.label} className="card">
                <h3>{stat.value}</h3>
                <p>{stat.label}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="panel">
          <h2>{t.countriesTitle}</h2>
          <div className="countryWrap">
            {countryItems.map((country) => (
              <span className="country" key={country}>
                {country}
              </span>
            ))}
          </div>
        </section>

        <section id="pricing" className="panel">
          <h2>{t.pricingTitle}</h2>
          <div className="grid pricingGrid">
            {dynamicPlans.map((plan) => (
              <article key={plan.id} className="card pricingCard">
                <h3>{plan.name[lang]}</h3>
                <p className="price">{plan.price}</p>
                <p>{plan.desc[lang]}</p>
                <button
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
      </main>

      <footer className="footer">
        <Link href="/terms">{t.footerTerms}</Link>
        <Link href="/privacy">{t.footerPrivacy}</Link>
        <Link href="/contact">{t.footerContact}</Link>
        <Link href="/support">{t.footerSupport}</Link>
        <Link href="/about">{t.footerAbout}</Link>
      </footer>

      <style jsx>{`
        .page {
          min-height: 100vh;
          color: #f8f5ee;
          background: radial-gradient(circle at top, #15234f 0%, #090f23 58%, #070b18 100%);
          font-family: "Inter", "Segoe UI", Arial, sans-serif;
        }
        .container {
          width: min(1140px, 92%);
          margin: 0 auto;
          padding: 24px 0 56px;
        }
        .header {
          width: min(1140px, 92%);
          margin: 0 auto;
          padding: 18px 0;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
        }
        .logo {
          width: 220px;
          max-width: 62vw;
          height: auto;
        }
        .headerActions {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 10px;
        }
        .hero {
          padding: 42px 0 24px;
        }
        .hero h1 {
          margin: 0;
          font-size: clamp(2rem, 4.7vw, 3.5rem);
          line-height: 1.15;
        }
        .hero p {
          max-width: 760px;
          font-size: 1.06rem;
          line-height: 1.8;
          opacity: 0.94;
        }
        .heroActions {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
        }
        .panel {
          background: rgba(6, 14, 34, 0.78);
          border: 1px solid rgba(212, 175, 55, 0.3);
          border-radius: 18px;
          padding: 24px;
          margin-top: 20px;
          box-shadow: 0 12px 40px rgba(0, 0, 0, 0.3);
        }
        .panel h2 {
          margin-top: 0;
          color: #f4ddb0;
        }
        .uploadForm {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin-top: 16px;
        }
        .uploadForm input {
          max-width: 100%;
          color: #e9e2cf;
        }
        .status {
          margin-top: 12px;
          color: #f4ddb0;
          font-weight: 600;
        }
        .grid {
          display: grid;
          gap: 14px;
          grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
        }
        .card {
          border: 1px solid rgba(212, 175, 55, 0.26);
          border-radius: 14px;
          padding: 16px;
          background: rgba(8, 17, 41, 0.7);
        }
        .pricingCard {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .pricingCard button {
          margin-top: auto;
        }
        .price {
          font-size: 1.9rem;
          margin: 0;
          color: #d4af37;
          font-weight: 700;
        }
        .countryWrap {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
        }
        .country {
          border: 1px solid rgba(212, 175, 55, 0.35);
          border-radius: 999px;
          padding: 8px 14px;
          background: rgba(6, 16, 40, 0.68);
        }
        .footer {
          display: flex;
          gap: 16px;
          flex-wrap: wrap;
          justify-content: center;
          padding: 24px 0 34px;
        }
        .footer :global(a) {
          color: #f8f5ee;
          text-decoration: none;
        }
        .goldBtn,
        .ghostBtn,
        .langBtn {
          border-radius: 10px;
          border: 1px solid transparent;
          padding: 10px 14px;
          font-weight: 600;
          text-decoration: none;
          cursor: pointer;
          transition: all 0.2s ease;
          font-size: 0.94rem;
        }
        .goldBtn {
          background: linear-gradient(120deg, #d4af37, #f4ddb0);
          color: #08112d;
          border-color: #d4af37;
        }
        .ghostBtn,
        .langBtn {
          background: transparent;
          color: #f8f5ee;
          border-color: rgba(212, 175, 55, 0.45);
        }
        .langBtn.active {
          background: rgba(212, 175, 55, 0.2);
        }
        @media (max-width: 768px) {
          .panel {
            padding: 18px;
          }
        }
      `}</style>
    </div>
  );
}
