/** Client-safe upload wizard steps (no Node deps). */
export const UPLOAD_WIZARD_STEPS = [
  { key: "resume", docType: "resume", required: true, en: "Upload Resume", fr: "Televerser le CV" },
  { key: "job", docType: "job_description", required: true, en: "Upload Job Description", fr: "Televerser la description de poste" },
  { key: "certs", docType: "credentials", required: false, en: "Upload Certifications (optional)", fr: "Certifications (optionnel)" },
  { key: "portfolio", docType: "portfolio", required: false, en: "Upload Portfolio (optional)", fr: "Portfolio (optionnel)" },
];
