import { useMemo, useState } from "react";
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
  },
};

export default function UploadWizard({ lang = "en", planId, documents = [], onUpload, onComplete }) {
  const t = LABELS[lang] || LABELS.en;
  const steps = useMemo(() => UPLOAD_WIZARD_STEPS, []);
  const [stepIndex, setStepIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

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
    <section className="rs-upload-wizard" data-rs-upload-wizard="1">
      <h3>{t.title}</h3>
      <p>
        {t.current}: <strong>{lang === "fr" ? current.fr : current.en}</strong> ·{" "}
        {current.required ? t.required : t.optional}
      </p>
      <div className="rs-upload-wizard-bar">
        <div className="rs-upload-wizard-fill" style={{ width: `${pct}%` }} />
      </div>
      <p>{pct}%</p>
      <label className="rs-upload-wizard-label">
        {t.upload}
        <input type="file" disabled={busy} onChange={(e) => handleFile(e.target.files?.[0])} />
      </label>
      {message ? <p className="rs-upload-toast" role="status">{message}</p> : null}
      <div className="rs-upload-wizard-actions">
        {!current.required ? (
          <button type="button" className="rs-btn-ghost" onClick={() => setStepIndex((i) => Math.min(i + 1, steps.length - 1))} disabled={busy}>
            {t.skip}
          </button>
        ) : null}
        <button type="button" className="rs-btn-accent" onClick={() => setStepIndex((i) => Math.min(i + 1, steps.length - 1))} disabled={busy || stepIndex >= steps.length - 1}>
          {t.complete}
        </button>
      </div>
    </section>
  );
}
