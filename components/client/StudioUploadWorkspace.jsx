import { useMemo, useState } from "react";
import { UPLOAD_WIZARD_STEPS } from "@/lib/client/upload-wizard-steps";
import StudioFileDropzone from "@/components/client/StudioFileDropzone";

const L = (lang, en, fr) => (lang === "fr" ? fr : en);

export default function StudioUploadWorkspace({
  planId,
  lang,
  documents = [],
  docTypeLabels,
  docTypes,
  setDocTypes,
  isUploading,
  replacingId,
  guidedMode = false,
  onUploadFile,
  onReplaceDocument,
  onRemoveDocument,
  onReload,
  formatDate,
}) {
  const docs = documents || [];
  const [stepIndex, setStepIndex] = useState(0);
  const [localBusy, setLocalBusy] = useState(false);
  const [message, setMessage] = useState("");

  const uploadedTypes = useMemo(
    () => new Set(docs.filter((d) => d.status !== "removed").map((d) => d.doc_type)),
    [docs]
  );

  const wizardStepIndex = useMemo(() => {
    if (!guidedMode) return -1;
    for (let i = stepIndex; i < UPLOAD_WIZARD_STEPS.length; i++) {
      const step = UPLOAD_WIZARD_STEPS[i];
      if (!uploadedTypes.has(step.docType)) return i;
    }
    for (let i = 0; i < stepIndex && i < UPLOAD_WIZARD_STEPS.length; i++) {
      const step = UPLOAD_WIZARD_STEPS[i];
      if (!uploadedTypes.has(step.docType)) return i;
    }
    return -1;
  }, [guidedMode, stepIndex, uploadedTypes]);

  const wizardActive = wizardStepIndex >= 0;
  const currentWizardStep = wizardActive ? UPLOAD_WIZARD_STEPS[wizardStepIndex] : null;
  const effectiveDocType = wizardActive
    ? currentWizardStep.docType
    : docTypes[planId] || "supporting_file";

  const wizardDoneCount = UPLOAD_WIZARD_STEPS.filter((s) => uploadedTypes.has(s.docType)).length;
  const wizardPct = Math.round((wizardDoneCount / UPLOAD_WIZARD_STEPS.length) * 100);
  const busy = isUploading || localBusy;

  async function handleDrop(file) {
    if (!file || busy) return;
    setMessage("");
    if (wizardActive) {
      setLocalBusy(true);
      try {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("planId", planId);
        fd.append("docType", effectiveDocType);
        const res = await fetch("/api/client/documents", {
          method: "POST",
          credentials: "same-origin",
          body: fd,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "upload_failed");
        setMessage(L(lang, "File saved.", "Fichier enregistre."));
        if (wizardStepIndex < UPLOAD_WIZARD_STEPS.length - 1) {
          setStepIndex(wizardStepIndex + 1);
        }
        await onReload?.();
      } catch (e) {
        setMessage(e.message || L(lang, "Upload failed.", "Echec du televersement."));
      } finally {
        setLocalBusy(false);
      }
      return;
    }
    await onUploadFile(planId, file, effectiveDocType);
  }

  function skipOptionalStep() {
    if (!currentWizardStep || currentWizardStep.required) return;
    setStepIndex((i) => Math.min(i + 1, UPLOAD_WIZARD_STEPS.length - 1));
  }

  return (
    <div className="rs-studio-upload-workspace">
      {wizardActive ? (
        <div className="rs-studio-guided-strip">
          <p className="rs-studio-guided-strip__label">
            {L(lang, "Intake step", "Etape d'intake")}{" "}
            <strong>
              {wizardStepIndex + 1}/{UPLOAD_WIZARD_STEPS.length} —{" "}
              {lang === "fr" ? currentWizardStep.fr : currentWizardStep.en}
            </strong>
            <span className={`rs-upload-wizard__tag${currentWizardStep.required ? " is-required" : ""}`}>
              {currentWizardStep.required
                ? L(lang, "Required", "Obligatoire")
                : L(lang, "Optional", "Optionnel")}
            </span>
          </p>
          <div className="rs-upload-wizard-bar">
            <div className="rs-upload-wizard-fill" style={{ width: `${wizardPct}%` }} />
          </div>
          {!currentWizardStep.required ? (
            <button type="button" className="rs-studio-action-btn" onClick={skipOptionalStep} disabled={busy}>
              {L(lang, "Skip this step", "Passer cette etape")}
            </button>
          ) : null}
        </div>
      ) : (
        <div className="rs-studio-field rs-studio-field--inline">
          <label className="rs-studio-field__label" htmlFor={`doc-type-${planId}`}>
            {L(lang, "Document type", "Type de document")}
          </label>
          <select
            id={`doc-type-${planId}`}
            className="rs-studio-select"
            value={docTypes[planId] || "supporting_file"}
            onChange={(e) => setDocTypes((s) => ({ ...s, [planId]: e.target.value }))}
          >
            {Object.keys(docTypeLabels).map((key) => (
              <option key={key} value={key}>
                {docTypeLabels[key] || key}
              </option>
            ))}
          </select>
        </div>
      )}

      <StudioFileDropzone lang={lang} busy={busy} inputDataAttr={planId} onFile={handleDrop} />

      {message ? (
        <p className="rs-upload-toast" role="status">
          {message}
        </p>
      ) : null}

      <h4 className="rs-studio-doc-list__title">{L(lang, "Uploaded files", "Fichiers televerses")}</h4>
      {docs.length ? (
        <ul className="rs-studio-doc-list">
          {docs.map((doc) => (
            <li key={doc.id} className="rs-studio-doc-row">
              <div className="rs-studio-doc-row__main">
                <span className="rs-studio-doc-row__name">{doc.original_name}</span>
                <span className="rs-studio-doc-row__meta">
                  {docTypeLabels[doc.doc_type] || doc.doc_type} · {doc.status} · {formatDate(doc.created_at)}
                </span>
              </div>
              <div className="rs-studio-doc-row__actions">
                <a
                  href={`/api/client/file?id=${encodeURIComponent(doc.id)}&mode=preview`}
                  target="_blank"
                  rel="noreferrer"
                  className="rs-studio-action-btn"
                >
                  {L(lang, "Preview", "Apercu")}
                </a>
                <a
                  href={`/api/client/file?id=${encodeURIComponent(doc.id)}&mode=download`}
                  className="rs-studio-action-btn"
                >
                  {L(lang, "Download", "Telecharger")}
                </a>
                <label className="rs-studio-action-btn rs-studio-action-btn--replace">
                  {replacingId === doc.id ? L(lang, "Replacing…", "Remplacement…") : L(lang, "Replace", "Remplacer")}
                  <input
                    type="file"
                    className="rs-studio-file-input"
                    disabled={replacingId === doc.id}
                    onChange={(e) => onReplaceDocument(planId, doc.id, e.target.files?.[0])}
                  />
                </label>
                <button
                  type="button"
                  className="rs-studio-action-btn rs-studio-action-btn--danger"
                  onClick={() => onRemoveDocument(doc.id)}
                >
                  {L(lang, "Remove", "Supprimer")}
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rs-studio-doc-list__empty">{L(lang, "No files uploaded yet.", "Aucun fichier televerse pour le moment.")}</p>
      )}
    </div>
  );
}
