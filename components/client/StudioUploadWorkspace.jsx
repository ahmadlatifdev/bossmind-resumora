import { useCallback, useMemo, useRef, useState } from "react";
import { UPLOAD_WIZARD_STEPS } from "@/lib/client/upload-wizard-steps";
import StudioFileDropzone from "@/components/client/StudioFileDropzone";
import StudioLuxuryUploadStatus from "@/components/client/StudioLuxuryUploadStatus";
import { uploadClientDocument, validateClientFile } from "@/lib/client/upload-client";
import { mapApiErrorToMessage, uploadErrorMessage } from "@/lib/client/studio-upload-i18n";

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
  const [uploadState, setUploadState] = useState("idle");
  const [uploadPct, setUploadPct] = useState(0);
  const [uploadError, setUploadError] = useState("");
  const [pendingFile, setPendingFile] = useState(null);
  const [pendingDocType, setPendingDocType] = useState("");
  const [etaSeconds, setEtaSeconds] = useState(null);
  const [speedKbps, setSpeedKbps] = useState(null);
  const [message, setMessage] = useState("");
  const [fileSyncWarnings, setFileSyncWarnings] = useState({});
  const uploadStartedRef = useRef(0);

  const syncMessage = L(
    lang,
    "Your file is being synchronized securely. Please refresh or re-upload if the issue persists.",
    "Votre fichier est en cours de synchronisation securisee. Actualisez ou televersez a nouveau si le probleme persiste."
  );

  const runUpload = useCallback(
    async (file, docType) => {
      setPendingFile(file);
      setPendingDocType(docType);
      setUploadError("");
      setUploadPct(0);
      setEtaSeconds(null);
      setSpeedKbps(null);
      uploadStartedRef.current = Date.now();

      setUploadState("validating");
      const clientCheck = validateClientFile(file, lang);
      if (!clientCheck.ok) {
        setUploadState("failed");
        setUploadError(clientCheck.message);
        return false;
      }

      setUploadState("scanning");
      await new Promise((r) => setTimeout(r, 280));
      setUploadState("uploading");

      try {
        await uploadClientDocument({
          file,
          planId,
          docType,
          lang,
          onStateChange: (state) => {
            if (state === "uploading") setUploadState("uploading");
            if (state === "retrying") setUploadState("retrying");
            if (state === "success") setUploadState("syncing");
          },
          onProgress: ({ loaded, total, percent }) => {
            setUploadPct(percent);
            const elapsed = (Date.now() - uploadStartedRef.current) / 1000;
            if (elapsed > 0.4 && total > 0) {
              const speed = loaded / 1024 / elapsed;
              setSpeedKbps(Math.round(speed));
              const remaining = total - loaded;
              setEtaSeconds(remaining > 0 && speed > 0 ? Math.max(1, Math.round(remaining / 1024 / speed)) : null);
            }
          },
        });
        setUploadState("success");
        setMessage(uploadErrorMessage("upload_success", lang));
        setPendingFile(null);
        await onReload?.();
        setTimeout(() => setUploadState("idle"), 2400);
        return true;
      } catch (e) {
        setUploadState("failed");
        setUploadError(e.message || mapApiErrorToMessage({ error: "upload_failed" }, lang));
        return false;
      }
    },
    [lang, planId, onReload]
  );

  async function handleFileAction(doc, mode) {
    setFileSyncWarnings((s) => {
      const next = { ...s };
      delete next[doc.id];
      return next;
    });
    try {
      const res = await fetch(
        `/api/client/file?id=${encodeURIComponent(doc.id)}&mode=${mode}&lang=${lang}`,
        { credentials: "same-origin", headers: { Accept: "application/json" } }
      );
      if (!res.ok && res.status !== 302) {
        const data = await res.json().catch(() => ({}));
        if (data.error === "file_missing" || data.code === "file_sync") {
          setFileSyncWarnings((s) => ({ ...s, [doc.id]: data.message || syncMessage }));
          return;
        }
        throw new Error(data.message || data.error || "file_unavailable");
      }
      if (res.redirected || res.url.includes("X-Amz") || res.url.includes("amazonaws")) {
        window.open(res.url, mode === "preview" ? "_blank" : "_self", "noopener,noreferrer");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      if (mode === "preview") {
        window.open(url, "_blank", "noopener,noreferrer");
      } else {
        const a = document.createElement("a");
        a.href = url;
        a.download = doc.original_name || "download";
        a.rel = "noopener";
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      setFileSyncWarnings((s) => ({ ...s, [doc.id]: e.message || syncMessage }));
    }
  }

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
  const busy =
    isUploading ||
    replacingId ||
    ["validating", "uploading", "scanning", "syncing", "retrying"].includes(uploadState);

  async function handleDrop(file) {
    if (!file || busy) return;
    setMessage("");

    if (wizardActive) {
      const ok = await runUpload(file, effectiveDocType);
      if (ok && wizardStepIndex < UPLOAD_WIZARD_STEPS.length - 1) {
        setStepIndex(wizardStepIndex + 1);
      }
      return;
    }

    await runUpload(file, effectiveDocType);
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

      <StudioLuxuryUploadStatus
        lang={lang}
        state={uploadState}
        percent={uploadPct}
        errorMessage={uploadError}
        etaSeconds={etaSeconds}
        speedKbps={speedKbps}
        pendingFile={pendingFile}
        onRetry={() => pendingFile && runUpload(pendingFile, pendingDocType || effectiveDocType)}
      />

      <StudioFileDropzone lang={lang} busy={busy} inputDataAttr={planId} onFile={handleDrop} />

      {message ? (
        <p className="rs-upload-toast rs-upload-toast--success" role="status">
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
                {fileSyncWarnings[doc.id] ? (
                  <p className="rs-studio-file-sync-warning" role="alert">
                    {fileSyncWarnings[doc.id]}
                  </p>
                ) : null}
              </div>
              <div className="rs-studio-doc-row__actions">
                <button
                  type="button"
                  className="rs-studio-action-btn"
                  onClick={() => handleFileAction(doc, "preview")}
                >
                  {L(lang, "Preview", "Apercu")}
                </button>
                <button
                  type="button"
                  className="rs-studio-action-btn"
                  onClick={() => handleFileAction(doc, "download")}
                >
                  {L(lang, "Download", "Telecharger")}
                </button>
                <label className="rs-studio-action-btn rs-studio-action-btn--replace">
                  {replacingId === doc.id ? L(lang, "Replacing…", "Remplacement…") : L(lang, "Replace", "Remplacer")}
                  <input
                    type="file"
                    className="rs-studio-file-input"
                    disabled={replacingId === doc.id || busy}
                    accept=".pdf,.doc,.docx"
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
