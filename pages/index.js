import { useMemo, useState } from "react";
import Link from "next/link";

const translations = {
  en: {
    navServices: "Services",
    navPricing: "Pricing",
    navUpload: "Upload",
    navCountries: "Countries",
    navContact: "Contact",
    navLogin: "Login",
    navRegister: "Register",
    heroBadge: "Luxury Resume & Career Intelligence",
    heroTitle: "Premium Career Positioning for Ambitious Global Professionals",
    heroSubtitle:
      "Resumora crafts executive-level resumes, compelling personal branding, and ATS-dominant narratives designed to increase your interview conversion across top international markets.",
    heroPrimary: "Explore Premium Services",
    heroSecondary: "Upload Resume / CV",
    uploadTitle: "Upload Your Resume / CV",
    uploadSubtitle:
      "Submit your current profile for a confidential, white-glove assessment. Our specialists evaluate ATS performance, recruiter readability, leadership messaging, and market fit before delivery.",
    uploadCaption: "Accepted formats: PDF, DOC, DOCX. Confidential and secure processing.",
    uploadButton: "Upload Document",
    uploadSuccess: "Upload completed successfully.",
    uploadError: "Upload failed. Please try again.",
    servicesTitle: "Premium Services",
    servicesSubtitle:
      "Every package is delivered by senior writers with recruiter insight, designed for measurable positioning in competitive sectors.",
    statsTitle: "Performance & Success Rates",
    statsSubtitle:
      "Our service quality is measured by outcomes, speed, and client retention across multiple industries.",
    countriesTitle: "Global Reach",
    countriesSubtitle:
      "Resumora supports professionals targeting regional and cross-border roles with market-specific formatting and language strategy.",
    pricingTitle: "Premium Pricing Plans",
    pricingSubtitle:
      "Select the service depth that matches your current career stage and urgency.",
    choosePlan: "Choose Plan",
    processing: "Processing...",
    footerAbout: "About",
    footerServices: "Services",
    footerTerms: "Terms",
    footerPrivacy: "Privacy",
    footerSupport: "Support",
    footerContact: "Contact",
    footerLine: "Resumora - Premium Career Studio for Global Professionals.",
  },
  fr: {
    navServices: "Services",
    navPricing: "Tarifs",
    navUpload: "Televersement",
    navCountries: "Pays",
    navContact: "Contact",
    navLogin: "Connexion",
    navRegister: "Inscription",
    heroBadge: "Service Premium de CV et Positionnement",
    heroTitle: "Positionnement de Carriere Premium pour Talents Internationaux",
    heroSubtitle:
      "Resumora cree des CV haut de gamme, une marque personnelle convaincante et des profils optimises ATS afin d augmenter vos opportunites d entretien dans les marches internationaux.",
    heroPrimary: "Explorer les Services Premium",
    heroSecondary: "Televerser CV / Resume",
    uploadTitle: "Televersez Votre CV / Resume",
    uploadSubtitle:
      "Soumettez votre profil pour une evaluation confidentielle et personnalisee. Nos specialistes analysent la performance ATS, la lisibilite recruteur, le positionnement leadership et l adequation au marche.",
    uploadCaption: "Formats acceptes: PDF, DOC, DOCX. Traitement securise et confidentiel.",
    uploadButton: "Televerser le document",
    uploadSuccess: "Televersement termine avec succes.",
    uploadError: "Echec du televersement. Veuillez reessayer.",
    servicesTitle: "Services Premium",
    servicesSubtitle:
      "Chaque offre est realisee par des redacteurs seniors avec expertise recruteur pour un positionnement mesurable.",
    statsTitle: "Performance et Taux de Reussite",
    statsSubtitle:
      "Notre qualite est evaluee selon les resultats clients, la rapidite de livraison et la fidelisation.",
    countriesTitle: "Portee Internationale",
    countriesSubtitle:
      "Resumora accompagne les professionnels visant des postes locaux et internationaux avec adaptation par marche cible.",
    pricingTitle: "Plans Tarifs Premium",
    pricingSubtitle:
      "Choisissez le niveau de service correspondant a votre etape de carriere et a votre priorite.",
    choosePlan: "Choisir le plan",
    processing: "Traitement...",
    footerAbout: "A propos",
    footerServices: "Services",
    footerTerms: "Conditions",
    footerPrivacy: "Confidentialite",
    footerSupport: "Support",
    footerContact: "Contact",
    footerLine: "Resumora - Studio de carriere premium pour talents internationaux.",
  },
};

const serviceItems = {
  en: [
    {
      title: "ATS Resume Architecture",
      desc: "Executive resume rewriting with keyword intelligence, clear structure, and modern formatting that improves visibility in screening systems and recruiter review.",
    },
    {
      title: "Elite Cover Letter Strategy",
      desc: "Tailored cover letters that align your profile to role requirements, industry tone, and leadership narrative for higher response quality.",
    },
    {
      title: "LinkedIn Authority Optimization",
      desc: "Profile refinement for headline, summary, achievements, and search discoverability so your digital brand matches premium hiring expectations.",
    },
    {
      title: "Interview Positioning Session",
      desc: "Role-focused interview preparation with strategic storylines, quantified impact points, and high-confidence answer frameworks.",
    },
    {
      title: "Bilingual Translation Support",
      desc: "English and French adaptation with professional tone control, ensuring your materials remain persuasive and natural in both languages.",
    },
    {
      title: "Priority Concierge Support",
      desc: "Fast-response revision windows, direct consultant communication, and guided document polishing before your final applications.",
    },
  ],
  fr: [
    {
      title: "Architecture CV ATS",
      desc: "Reecriture complete du CV avec intelligence de mots-cles, structure claire et presentation moderne pour renforcer la visibilite ATS et recruteur.",
    },
    {
      title: "Strategie Lettre Premium",
      desc: "Lettres personnalisees selon le poste cible, le secteur et votre narration de valeur afin d augmenter la qualite des retours recruteur.",
    },
    {
      title: "Optimisation LinkedIn Autorite",
      desc: "Amelioration du profil LinkedIn: titre, resume, realisations et referencement pour aligner votre presence digitale avec les standards premium.",
    },
    {
      title: "Preparation Entretien Ciblee",
      desc: "Coaching entretien oriente poste avec recits d impact, preuves chiffrees et cadres de reponse pour des echanges plus convaincants.",
    },
    {
      title: "Support de Traduction Bilingue",
      desc: "Adaptation professionnelle en anglais et francais avec ton naturel et persuasif pour candidatures multinationales.",
    },
    {
      title: "Support Concierge Prioritaire",
      desc: "Revisions rapides, communication directe avec conseiller expert, et finalisation complete avant envoi de candidatures.",
    },
  ],
};

const statItems = {
  en: [
    { value: "98.2%", label: "Client Satisfaction", desc: "Average score across quality, delivery, and communication." },
    { value: "4.7x", label: "Interview Rate Lift", desc: "Typical interview increase after profile re-engineering." },
    { value: "34h", label: "Average Delivery", desc: "Fast premium turnaround with structured quality controls." },
    { value: "16k+", label: "Professionals Supported", desc: "International clients from early career to executive level." },
  ],
  fr: [
    { value: "98.2%", label: "Satisfaction Client", desc: "Moyenne globale sur qualite, delai et communication." },
    { value: "4.7x", label: "Hausse du Taux d Entretien", desc: "Progression moyenne apres optimisation complete du profil." },
    { value: "34h", label: "Delai Moyen", desc: "Livraison rapide premium avec controle qualite strict." },
    { value: "16k+", label: "Professionnels Accompagnes", desc: "Clients internationaux du niveau junior au niveau executif." },
  ],
};

const countryItems = {
  en: [
    { country: "Canada", detail: "Bilingual and federal resume standards." },
    { country: "United States", detail: "Impact-driven leadership positioning." },
    { country: "United Kingdom", detail: "Competency-aligned CV structuring." },
    { country: "France", detail: "Premium French profile localization." },
    { country: "Germany", detail: "Precision-focused professional narratives." },
    { country: "United Arab Emirates", detail: "Executive-ready regional applications." },
    { country: "Singapore", detail: "Global finance and tech profile tuning." },
    { country: "Australia", detail: "Clear value articulation for recruiters." },
  ],
  fr: [
    { country: "Canada", detail: "Standards bilingues et formats federaux." },
    { country: "Etats-Unis", detail: "Positionnement leadership axe resultats." },
    { country: "Royaume-Uni", detail: "Structure CV alignee competences clefs." },
    { country: "France", detail: "Localisation premium du profil en francais." },
    { country: "Allemagne", detail: "Narration professionnelle precise et claire." },
    { country: "Emirats Arabes Unis", detail: "Candidatures regionales haut niveau." },
    { country: "Singapour", detail: "Optimisation profils finance et technologie." },
    { country: "Australie", detail: "Valeur professionnelle lisible pour recruteurs." },
  ],
};

const plans = [
  {
    id: "basic",
    name: { en: "Basic", fr: "Basic" },
    price: "$79",
    desc: {
      en: "ATS-focused resume optimization, formatting upgrade, and targeted keyword alignment for strong first-level screening.",
      fr: "Optimisation CV orientee ATS, mise en forme premium et alignement mots-cles pour passer les premiers filtres.",
    },
    env: "NEXT_PUBLIC_STRIPE_PRICE_STARTER",
  },
  {
    id: "professional",
    name: { en: "Professional", fr: "Professionnel" },
    price: "$149",
    desc: {
      en: "Complete resume rewrite plus strategic cover letter and deeper positioning for competitive roles and international applications.",
      fr: "Reecriture complete du CV, lettre strategique et positionnement avance pour postes competitifs et candidatures internationales.",
    },
    env: "NEXT_PUBLIC_STRIPE_PRICE_PRO",
  },
  {
    id: "elite",
    name: { en: "Elite", fr: "Elite" },
    price: "$249",
    desc: {
      en: "Full career package: resume, cover letter, LinkedIn optimization, and interview preparation with priority concierge support.",
      fr: "Pack carriere complet: CV, lettre, optimisation LinkedIn et preparation entretien avec support concierge prioritaire.",
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
        <div className="logoWrap">
          <img src="/resumora-logo.svg" alt="Resumora" className="logo" />
        </div>
        <nav className="nav">
          <a href="#services">{t.navServices}</a>
          <a href="#pricing">{t.navPricing}</a>
          <a href="#upload">{t.navUpload}</a>
          <a href="#countries">{t.navCountries}</a>
          <Link href="/contact">{t.navContact}</Link>
        </nav>
        <div className="headerActions">
          <button
            className={`langBtn ${lang === "en" ? "active" : ""}`}
            onClick={() => setLang("en")}
            type="button"
          >
            EN
          </button>
          <button
            className={`langBtn ${lang === "fr" ? "active" : ""}`}
            onClick={() => setLang("fr")}
            type="button"
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
          <span className="badge">{t.heroBadge}</span>
          <h1>{t.heroTitle}</h1>
          <p>{t.heroSubtitle}</p>
          <div className="heroActions">
            <a href="#services" className="goldBtn heroBtn">
              {t.heroPrimary}
            </a>
            <a href="#upload" className="ghostBtn heroBtn">
              {t.heroSecondary}
            </a>
          </div>
        </section>

        <section id="upload" className="panel uploadPanel">
          <div>
            <h2>{t.uploadTitle}</h2>
            <p>{t.uploadSubtitle}</p>
            <p className="caption">{t.uploadCaption}</p>
          </div>
          <form onSubmit={handleUpload} className="uploadForm">
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
            {serviceItems[lang].map((service) => (
              <article key={service.title} className="card serviceCard">
                <h3>{service.title}</h3>
                <p>{service.desc}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="panel">
          <h2>{t.statsTitle}</h2>
          <p className="sectionSubtitle">{t.statsSubtitle}</p>
          <div className="grid statsGrid">
            {statItems[lang].map((stat) => (
              <article key={stat.label} className="card statCard">
                <h3>{stat.value}</h3>
                <h4>{stat.label}</h4>
                <p>{stat.desc}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="pricing" className="panel">
          <h2>{t.pricingTitle}</h2>
          <p className="sectionSubtitle">{t.pricingSubtitle}</p>
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
                  type="button"
                >
                  {busyPlan === plan.id ? t.processing : t.choosePlan}
                </button>
              </article>
            ))}
          </div>
        </section>

        <section id="countries" className="panel">
          <h2>{t.countriesTitle}</h2>
          <p className="sectionSubtitle">{t.countriesSubtitle}</p>
          <div className="grid countryGrid">
            {countryItems[lang].map((item) => (
              <article className="card countryCard" key={item.country}>
                <h3>{item.country}</h3>
                <p>{item.detail}</p>
              </article>
            ))}
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="footerInner">
          <p>{t.footerLine}</p>
          <div className="footerLinks">
            <Link href="/about">{t.footerAbout}</Link>
            <a href="#services">{t.footerServices}</a>
            <Link href="/terms">{t.footerTerms}</Link>
            <Link href="/privacy">{t.footerPrivacy}</Link>
            <Link href="/support">{t.footerSupport}</Link>
            <Link href="/contact">{t.footerContact}</Link>
          </div>
        </div>
      </footer>

      <style jsx>{`
        .page {
          min-height: 100vh;
          color: #f8f5ee;
          background: radial-gradient(circle at top, #1a2f62 0%, #0b1633 52%, #050a17 100%);
          font-family: "Inter", "Segoe UI", Arial, sans-serif;
        }
        .header {
          width: min(1440px, 95%);
          margin: 0 auto;
          padding: 28px 0 22px;
          display: grid;
          grid-template-columns: auto 1fr auto;
          align-items: center;
          gap: 28px;
        }
        .logoWrap {
          justify-self: start;
        }
        .logo {
          width: clamp(250px, 23vw, 360px);
          height: auto;
          max-width: 100%;
        }
        .nav {
          display: flex;
          align-items: center;
          justify-content: center;
          flex-wrap: wrap;
          gap: 20px;
        }
        .nav :global(a),
        .nav a {
          color: #f8f5ee;
          text-decoration: none;
          font-size: 1rem;
          font-weight: 600;
          opacity: 0.9;
          transition: opacity 0.2s ease;
        }
        .nav :global(a):hover,
        .nav a:hover {
          opacity: 1;
        }
        .headerActions {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: flex-end;
          gap: 10px;
        }
        .container {
          width: min(1440px, 95%);
          margin: 0 auto;
          padding: 18px 0 80px;
        }
        .hero {
          padding: 48px 0 34px;
          min-height: 42vh;
        }
        .badge {
          display: inline-flex;
          border: 1px solid rgba(212, 175, 55, 0.55);
          border-radius: 999px;
          padding: 8px 16px;
          font-size: 0.9rem;
          color: #f4ddb0;
          background: rgba(10, 19, 44, 0.82);
          margin-bottom: 16px;
        }
        .hero h1 {
          margin: 0;
          max-width: 1080px;
          font-size: clamp(2.3rem, 4.9vw, 4.35rem);
          line-height: 1.08;
          letter-spacing: -0.02em;
        }
        .hero p {
          max-width: 980px;
          margin-top: 18px;
          font-size: clamp(1.06rem, 1.45vw, 1.28rem);
          line-height: 1.8;
          opacity: 0.96;
        }
        .heroActions {
          display: flex;
          flex-wrap: wrap;
          gap: 14px;
          margin-top: 28px;
        }
        .heroBtn {
          padding: 14px 22px;
          font-size: 1rem;
        }
        .panel {
          background: linear-gradient(140deg, rgba(7, 15, 37, 0.92), rgba(10, 19, 46, 0.8));
          border: 1px solid rgba(212, 175, 55, 0.33);
          border-radius: 20px;
          padding: clamp(24px, 2.4vw, 38px);
          margin-top: 24px;
          box-shadow: 0 18px 50px rgba(0, 0, 0, 0.28);
        }
        .panel h2 {
          margin: 0;
          color: #f4ddb0;
          font-size: clamp(1.5rem, 2vw, 2rem);
        }
        .sectionSubtitle {
          margin: 12px 0 0;
          max-width: 980px;
          color: #e5decb;
          line-height: 1.75;
        }
        .uploadPanel {
          display: grid;
          gap: 20px;
        }
        .caption {
          margin-top: 10px;
          color: #ccb98a;
          font-size: 0.95rem;
        }
        .uploadForm {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin-top: 4px;
        }
        .uploadForm input {
          min-width: 290px;
          max-width: 100%;
          color: #efe7d4;
          background: rgba(7, 15, 36, 0.65);
          border: 1px solid rgba(212, 175, 55, 0.3);
          border-radius: 10px;
          padding: 11px 12px;
        }
        .status {
          margin-top: 2px;
          color: #f4ddb0;
          font-weight: 600;
        }
        .grid {
          display: grid;
          gap: 16px;
          margin-top: 20px;
        }
        .serviceGrid {
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        }
        .statsGrid,
        .countryGrid,
        .pricingGrid {
          grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
        }
        .card {
          border: 1px solid rgba(212, 175, 55, 0.3);
          border-radius: 14px;
          padding: 18px;
          background: rgba(10, 19, 45, 0.68);
        }
        .serviceCard h3,
        .countryCard h3,
        .pricingCard h3 {
          margin: 0;
          color: #f5e4bb;
          font-size: 1.16rem;
        }
        .serviceCard p,
        .countryCard p,
        .pricingCard p,
        .statCard p {
          margin: 10px 0 0;
          line-height: 1.65;
          color: #e8dfca;
        }
        .statCard {
          min-height: 190px;
        }
        .statCard h3 {
          margin: 0;
          color: #d4af37;
          font-size: clamp(1.9rem, 2.7vw, 2.35rem);
        }
        .statCard h4 {
          margin: 10px 0 0;
          color: #f3dfb4;
          font-size: 1.05rem;
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
          font-size: 2rem;
          margin: 0;
          color: #d4af37;
          font-weight: 700;
          line-height: 1;
        }
        .footer {
          border-top: 1px solid rgba(212, 175, 55, 0.27);
          padding: 28px 0 36px;
        }
        .footerInner {
          width: min(1440px, 95%);
          margin: 0 auto;
          display: flex;
          flex-wrap: wrap;
          justify-content: space-between;
          align-items: center;
          gap: 14px;
        }
        .footerInner p {
          margin: 0;
          color: #dbd0b2;
        }
        .footerLinks {
          display: flex;
          flex-wrap: wrap;
          gap: 16px;
        }
        .footerLinks :global(a),
        .footerLinks a {
          color: #f8f5ee;
          text-decoration: none;
          font-weight: 600;
          opacity: 0.9;
        }
        .footerLinks :global(a):hover,
        .footerLinks a:hover {
          opacity: 1;
        }
        .goldBtn,
        .ghostBtn,
        .langBtn {
          border-radius: 10px;
          border: 1px solid transparent;
          padding: 10px 14px;
          font-weight: 700;
          text-decoration: none;
          cursor: pointer;
          transition: all 0.2s ease;
          font-size: 0.94rem;
        }
        .goldBtn {
          background: linear-gradient(120deg, #caa23a, #f4ddb0);
          color: #08112d;
          border-color: rgba(212, 175, 55, 0.8);
        }
        .ghostBtn,
        .langBtn {
          background: rgba(7, 15, 36, 0.35);
          color: #f8f5ee;
          border-color: rgba(212, 175, 55, 0.45);
        }
        .langBtn.active {
          background: rgba(212, 175, 55, 0.22);
        }
        @media (max-width: 1150px) {
          .header {
            grid-template-columns: 1fr;
            justify-items: start;
            gap: 14px;
          }
          .nav {
            justify-content: flex-start;
          }
          .headerActions {
            justify-content: flex-start;
          }
        }
        @media (max-width: 768px) {
          .panel {
            padding: 20px;
          }
          .uploadForm input {
            min-width: 100%;
          }
        }
      `}</style>
    </div>
  );
}
