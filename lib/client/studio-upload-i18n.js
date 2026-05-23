const MESSAGES = {
  invalid_format: {
    en: "Please upload a PDF, DOC, or DOCX file.",
    fr: "Veuillez televerser un fichier PDF, DOC ou DOCX.",
  },
  file_too_large: {
    en: "This file exceeds the 20 MB executive upload limit.",
    fr: "Ce fichier depasse la limite executive de 20 Mo.",
  },
  invalid_mime: {
    en: "This file type is not supported for secure intake.",
    fr: "Ce type de fichier n'est pas pris en charge pour l'intake securise.",
  },
  corrupt_file: {
    en: "This file appears damaged or unreadable. Try exporting it again as PDF or DOCX.",
    fr: "Ce fichier semble endommage ou illisible. Reexportez-le en PDF ou DOCX.",
  },
  blocked_format: {
    en: "This file type is blocked for security reasons.",
    fr: "Ce type de fichier est bloque pour des raisons de securite.",
  },
  sign_in_required: {
    en: "Please sign in to upload documents.",
    fr: "Veuillez vous connecter pour televerser des documents.",
  },
  not_entitled: {
    en: "Your executive plan must be active before uploading.",
    fr: "Votre forfait executif doit etre actif avant le televersement.",
  },
  s3_upload_failed: {
    en: "Secure cloud sync failed. We will retry automatically.",
    fr: "La synchronisation cloud securisee a echoue. Nouvelle tentative automatique.",
  },
  storage_unconfigured: {
    en: "Secure storage is being configured. Please retry in a moment.",
    fr: "Le stockage securise est en cours de configuration. Reessayez dans un instant.",
  },
  upload_failed: {
    en: "Upload could not complete. Tap retry to try again.",
    fr: "Le televersement n'a pas pu aboutir. Appuyez sur Reessayer.",
  },
  internal_error: {
    en: "A temporary server error occurred. Please try again.",
    fr: "Une erreur serveur temporaire s'est produite. Veuillez reessayer.",
  },
  upload_success: {
    en: "Document secured and saved to your executive workspace.",
    fr: "Document securise et enregistre dans votre espace executif.",
  },
  formidable_unavailable: {
    en: "Upload service is temporarily unavailable. Please retry shortly.",
    fr: "Le service de televersement est temporairement indisponible. Reessayez sous peu.",
  },
};

const STATE_LABELS = {
  idle: { en: "Ready to upload", fr: "Pret pour le televersement" },
  validating: { en: "Validating document…", fr: "Validation du document…" },
  uploading: { en: "Uploading securely…", fr: "Televersement securise…" },
  scanning: { en: "Security scan in progress…", fr: "Analyse de securite…" },
  syncing: { en: "Syncing to secure vault…", fr: "Synchronisation vers le coffre securise…" },
  success: { en: "Upload complete", fr: "Televersement termine" },
  failed: { en: "Upload failed", fr: "Echec du televersement" },
  retrying: { en: "Retrying upload…", fr: "Nouvelle tentative…" },
};

function uploadErrorMessage(code, lang = "en") {
  const key = String(code || "upload_failed");
  const row = MESSAGES[key] || MESSAGES.upload_failed;
  return row[lang === "fr" ? "fr" : "en"] || row.en;
}

function uploadStateLabel(state, lang = "en") {
  const row = STATE_LABELS[state] || STATE_LABELS.idle;
  return row[lang === "fr" ? "fr" : "en"] || row.en;
}

function mapApiErrorToMessage(data, lang = "en") {
  if (!data) return uploadErrorMessage("upload_failed", lang);
  if (data.message && typeof data.message === "string" && !data.message.startsWith("{")) return data.message;
  return uploadErrorMessage(data.error || data.code, lang);
}

module.exports = {
  uploadErrorMessage,
  uploadStateLabel,
  mapApiErrorToMessage,
  MESSAGES,
  STATE_LABELS,
};
