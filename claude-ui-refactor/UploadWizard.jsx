import { useMemo, useState } from "react";
import { Upload } from "lucide-react";
import { UPLOAD_WIZARD_STEPS } from "@/lib/client/upload-wizard-steps";

const LABELS = {
  en: {
    title: "Guided upload",
    required: "Required",
    optional: "Optional",
    current: "Current step",
    upload: "Choose file",
    skip: "Skip optional step",
    complete: "Next step",
    saved: "File saved.",
    failed: "Upload failed",
    uploading: "Uploading…",
    dropTitle: "Drop file for this step",
    dropHint: "or click to browse",
  },
  fr: {
    title: "Televersement guide",
    required: "Obligatoire",
    optional: "Optionnel",
    current: "Etape actuelle",
    upload: "Choisir un fichier",
    skip: "Passer cette etape",
    complete: "Etape suivante",
    saved: "Fichier enregistre.",
    failed: "Echec du televersement",
    uploading: "Televersement…",
    dropTitle: "Deposez le fichier pour cette etape",
    dropHint: "ou cliquez pour parcourir",
  },
};

export default function UploadWizard({ lang = "en", planId, documents = [], onUpload, onComplete }) {
  const t = LABELS[lang] || LABELS.en;
  const steps = useMemo(() => UPLOAD_WIZARD_STEPS, []);
  const [stepIndex, setStepIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [dragOver, setDragOver] = useState(false);

  const current = steps[stepIndex] || steps[0];
  const uploadedTypes = new Set(
    (documents || []).filter((d) => d.status !== "removed").map((d) => d.doc_type)
  );
  const requiredDone = steps.filter((s) => s.required).every((s) => uploadedTypes.has(s.docType));
  const doneCount = steps.filter((s) => uploadedTypes.has(s.docType)).length;
  const pct = Math.round((doneCount / steps.length) * 100);

  async function handleFile(file) {
    if (!file || !planId || !current) return;
    setBusy(true);
    setMessage("");
    const fd = new FormData();
    fd.append("file", file);
    fd.append("planId", planId);
    fd.append("docType", current.docType);
    try {
      const res = await fetch("/api/client/documents", {
        method: "POST",
        credentials: "same-origin",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "upload_failed");
      setMessage(t.saved);
      if (onUpload) await onUpload(data);
      if (stepIndex < steps.length - 1) setStepIndex(stepIndex + 1);
      else if (requiredDone && onComplete) await onComplete();
    } catch (e) {
      setMessage(e.message || t.failed);
    } finally {
      setBusy(false);
    }
  }

  if (!planId) return null;

  return (
    <section className="rs-upload-wizard rs-upload-wizard--lux" data-rs-upload-wizard="1">
      <h3 className="rs-upload-wizard__title">{t.title}</h3>
      <p className="rs-upload-wizard__step">
        {t.current}: <strong>{lang === "fr" ? current.fr : current.en}</strong>
        <span className={`rs-upload-wizard__tag${current.required ? " is-required" : ""}`}>
          {current.required ? t.required : t.optional}
        </span>
      </p>
      <div className="rs-upload-wizard-bar">
        <div className="rs-upload-wizard-fill" style={{ width: `${pct}%` }} />
      </div>
      <p className="rs-upload-wizard__pct">{pct}%</p>

      <label
        className={`rs-studio-dropzone rs-studio-dropzone--compact${dragOver ? " rs-studio-dropzone--active" : ""}${busy ? " rs-studio-dropzone--busy" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          if (!busy) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (!busy) handleFile(e.dataTransfer?.files?.[0]);
        }}
      >
        <Upload className="rs-studio-dropzone-icon" size={22} strokeWidth={1.5} aria-hidden />
        <span className="rs-studio-dropzone-title">{busy ? t.uploading : t.dropTitle}</span>
        <span className="rs-studio-dropzone-hint">{t.dropHint}</span>
        <input
          type="file"
          className="rs-studio-file-input"
          disabled={busy}
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
      </label>

      {message ? (
        <p className="rs-upload-toast" role="status">
          {message}
        </p>
      ) : null}
      <div className="rs-upload-wizard-actions">
        {!current.required ? (
          <button
            type="button"
            className="rs-btn-ghost"
            onClick={() => setStepIndex((i) => Math.min(i + 1, steps.length - 1))}
            disabled={busy}
          >
            {t.skip}
          </button>
        ) : null}
        <button
          type="button"
          className="rs-btn-accent"
          onClick={() => setStepIndex((i) => Math.min(i + 1, steps.length - 1))}
          disabled={busy || stepIndex >= steps.length - 1}
        >
          {t.complete}
        </button>
      </div>
    </section>
  );
}
