import Link from "next/link";
import { CheckCircle2, Clock, FileText, Sparkles } from "lucide-react";
import UploadWizard from "@/components/client/UploadWizard";
import StudioFileDropzone from "@/components/client/StudioFileDropzone";

const DOC_TYPE_KEYS = [
  "resume",
  "cover_letter",
  "linkedin_notes",
  "credentials",
  "job_description",
  "supporting_file",
];

const L = (lang, en, fr) => (lang === "fr" ? fr : en);

function deliveryBadgeMeta(plan, lang) {
  const status = plan.delivery?.status || plan.generationStatus || "in_progress";
  if (status === "ready") {
    return {
      className: "rs-studio-badge rs-studio-badge--ready",
      label: L(lang, "Delivered", "Livre"),
      icon: CheckCircle2,
    };
  }
  if (status === "queued") {
    return {
      className: "rs-studio-badge rs-studio-badge--queued",
      label: L(lang, "Queued", "En file"),
      icon: Clock,
    };
  }
  return {
    className: "rs-studio-badge rs-studio-badge--progress",
    label: L(lang, "In progress", "En cours"),
    icon: Sparkles,
  };
}

export default function StudioWorkspaceCard({
  plan,
  lang,
  t,
  docTypeLabels,
  docTypes,
  setDocTypes,
  uploadingPlan,
  replacingId,
  requestingPlan,
  editNotes,
  setEditNotes,
  editResumeLength,
  setEditResumeLength,
  showUploadWizard,
  router,
  onUploadFile,
  onReplaceDocument,
  onRemoveDocument,
  onRequestFreeEdit,
  onReload,
  formatDate,
}) {
  const badge = deliveryBadgeMeta(plan, lang);
  const BadgeIcon = badge.icon;
  const docs = plan.documents || [];
  const isUploading = uploadingPlan === plan.planId;
  const selectedResumeLength = editResumeLength?.[plan.planId] === "2_pages" ? "2_pages" : "standard";

  function setResumeLengthForPlan(next) {
    setEditResumeLength((s) => ({ ...s, [plan.planId]: next === "2_pages" ? "2_pages" : "standard" }));
  }

  function resumeLengthLabel(value) {
    if (value === "2_pages") {
      return L(lang, "2-page resume", "CV 2 pages");
    }
    return L(lang, "Standard length", "Longueur standard");
  }

  return (
    <article className="rs-studio-workspace-card" data-plan={plan.planId}>
      <header className="rs-studio-workspace-card__head">
        <div className="rs-studio-workspace-card__title-row">
          <h2 className="rs-studio-workspace-card__title">{plan.displayName}</h2>
          <span className={badge.className}>
            <BadgeIcon size={14} strokeWidth={2} aria-hidden />
            {badge.label}
          </span>
        </div>
        {plan.freeEditsLabel ? (
          <p className="rs-studio-workspace-card__meta">
            {t.clientHubFreeEdits}: <strong>{plan.freeEditsLabel}</strong>
            <span className="rs-studio-workspace-card__meta-sep">·</span>
            {L(lang, "Free edits remaining", "Retouches gratuites restantes")}:{" "}
            <strong>{plan.freeEdits?.remaining ?? 0}</strong> / {plan.freeEdits?.included ?? 0}
          </p>
        ) : null}
      </header>

      {plan.features?.length ? (
        <ul className="rs-studio-feature-list">
          {plan.features.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      ) : null}

      {plan.progressTracker ? (
        <div className="rs-studio-panel rs-studio-panel--tracker">
          <p className="rs-studio-panel__label">
            {L(lang, "Onboarding progress", "Progression onboarding")}
            <strong>{plan.progressTracker.percent}%</strong>
          </p>
          <div className="rs-studio-progress-bar">
            <div className="rs-studio-progress-bar__fill" style={{ width: `${plan.progressTracker.percent}%` }} />
          </div>
          <ol className="rs-studio-step-list">
            {plan.progressTracker.steps.map((s) => (
              <li key={s.key} className={s.done ? "is-done" : ""}>
                {s.done ? "✓" : "○"} {s.label}
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {(plan.delivery?.status === "ready" || plan.generationStatus === "ready") ? (
        <div className="rs-studio-ready-banner" role="status">
          {L(lang, "Resume Ready — download your deliverables below.", "CV pret — telechargez vos livrables ci-dessous.")}
        </div>
      ) : null}

      {plan.generationStatus ? (
        <div className="rs-studio-panel rs-studio-panel--generation">
          <p>
            <span className="rs-studio-panel__label">{L(lang, "Generation", "Generation")}</span>
            <span className="rs-studio-generation-pill">{plan.generationStatus}</span>
            {plan.generationMeta?.stageMessage ? (
              <span className="rs-studio-generation-msg"> — {plan.generationMeta.stageMessage}</span>
            ) : null}
          </p>
        </div>
      ) : null}

      {showUploadWizard || router.query?.onboarding === "upload" || !docs.some((d) => d.doc_type === "resume" && d.status !== "removed") ? (
        <div className="rs-studio-panel">
          <UploadWizard
            lang={lang}
            planId={plan.planId}
            documents={docs}
            onUpload={onReload}
            onComplete={onReload}
          />
        </div>
      ) : null}

      {plan.planId === "essential_advanced" ? (
        <div className="rs-studio-panel rs-studio-panel--premium">
          <h3>{L(lang, "Essential Advanced Premium", "Essential Advanced Premium")}</h3>
          <p>
            {L(
              lang,
              "3 interview videos · Q&A library · 20 tips · bilingual EN/FR delivery",
              "3 videos · bibliotheque Q&R · 20 conseils · livraison EN/FR"
            )}
          </p>
          <Link href="/studio/essential-advanced" className="rs-btn-accent">
            {L(lang, "Open Premium Studio", "Ouvrir le studio premium")}
          </Link>
        </div>
      ) : null}

      {plan.delivery ? (
        <div className="rs-studio-panel rs-studio-panel--delivery">
          <p className="rs-studio-panel__label">
            {L(lang, "Delivery status", "Statut de livraison")}
            <span className="rs-studio-generation-pill">{plan.delivery.status}</span>
          </p>
          {plan.delivery.message ? <p className="rs-studio-panel__copy">{plan.delivery.message}</p> : null}
          {plan.delivery?.download_url || plan.generationStatus === "ready" ? (
            <div className="rs-studio-download-row">
              <a
                href={`/api/client/download?planId=${encodeURIComponent(plan.planId)}&format=pdf&lang=${lang}`}
                className="rs-btn-accent"
              >
                {L(lang, "Download PDF", "Telecharger PDF")}
              </a>
              <a
                href={`/api/client/download?planId=${encodeURIComponent(plan.planId)}&format=docx&lang=${lang}`}
                className="rs-btn-ghost"
              >
                {L(lang, "Download DOCX", "Telecharger DOCX")}
              </a>
              <a
                href={`/api/client/download?planId=${encodeURIComponent(plan.planId)}&lang=${lang === "fr" ? "en" : "fr"}`}
                className="rs-btn-ghost"
              >
                {L(lang, "Bilingual pack (EN/FR)", "Pack bilingue EN/FR")}
              </a>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="rs-studio-panel rs-studio-panel--upload">
        <h3 className="rs-studio-panel__heading">
          <FileText size={18} strokeWidth={1.75} aria-hidden />
          {L(lang, "Secure uploads", "Televersements securises")}
        </h3>

        <div className="rs-studio-field">
          <label className="rs-studio-field__label" htmlFor={`doc-type-${plan.planId}`}>
            {L(lang, "Document type", "Type de document")}
          </label>
          <select
            id={`doc-type-${plan.planId}`}
            className="rs-studio-select"
            value={docTypes[plan.planId] || "supporting_file"}
            onChange={(e) => setDocTypes((s) => ({ ...s, [plan.planId]: e.target.value }))}
          >
            {DOC_TYPE_KEYS.map((key) => (
              <option key={key} value={key}>
                {docTypeLabels[key] || key}
              </option>
            ))}
          </select>
        </div>

        <StudioFileDropzone
          lang={lang}
          busy={isUploading}
          inputDataAttr={plan.planId}
          onFile={(file) => onUploadFile(plan.planId, file)}
        />

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
                      onChange={(e) => onReplaceDocument(plan.planId, doc.id, e.target.files?.[0])}
                    />
                  </label>
                  <button type="button" className="rs-studio-action-btn rs-studio-action-btn--danger" onClick={() => onRemoveDocument(doc.id)}>
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

      <div className="rs-studio-panel rs-studio-panel--edit">
        <h3 className="rs-studio-panel__heading">{L(lang, "Request Free Edit", "Demander une retouche gratuite")}</h3>
        <fieldset className="rs-studio-edit-length">
          <legend className="rs-studio-edit-length__legend">
            {L(lang, "Resume format for this edit", "Format du CV pour cette retouche")}
          </legend>
          <label
            className={`rs-studio-edit-length__option${selectedResumeLength === "standard" ? " is-selected" : ""}`}
          >
            <input
              type="radio"
              name={`resume-length-${plan.planId}`}
              value="standard"
              checked={selectedResumeLength === "standard"}
              onChange={() => setResumeLengthForPlan("standard")}
            />
            <span className="rs-studio-edit-length__title">{L(lang, "Standard resume length", "Longueur de CV standard")}</span>
            <span className="rs-studio-edit-length__hint">
              {L(lang, "Default deliverable length for your plan.", "Longueur livrable par defaut pour votre forfait.")}
            </span>
          </label>
          <label
            className={`rs-studio-edit-length__option rs-studio-edit-length__option--two-page${selectedResumeLength === "2_pages" ? " is-selected" : ""}`}
          >
            <input
              type="radio"
              name={`resume-length-${plan.planId}`}
              value="2_pages"
              checked={selectedResumeLength === "2_pages"}
              onChange={() => setResumeLengthForPlan("2_pages")}
            />
            <span className="rs-studio-edit-length__title">
              {L(lang, "Apply this edit to a 2-page resume", "Appliquer cette retouche a un CV de 2 pages")}
            </span>
            <span className="rs-studio-edit-length__hint">
              {L(
                lang,
                "Your strategist will format this included edit as a two-page executive resume.",
                "Votre strategiste formatera cette retouche incluse en CV executif de deux pages."
              )}
            </span>
          </label>
        </fieldset>
        <textarea
          className="rs-studio-textarea"
          value={editNotes[plan.planId] || ""}
          onChange={(e) => setEditNotes((s) => ({ ...s, [plan.planId]: e.target.value }))}
          placeholder={L(
            lang,
            "Describe required updates to your resume deliverable…",
            "Decrivez les modifications demandees pour votre livrable…"
          )}
          rows={4}
        />
        <button
          type="button"
          className="rs-btn-accent rs-studio-edit-cta"
          onClick={() => onRequestFreeEdit(plan.planId)}
          disabled={requestingPlan === plan.planId || (plan.freeEdits?.remaining ?? 0) <= 0}
        >
          {requestingPlan === plan.planId
            ? L(lang, "Submitting…", "Envoi…")
            : L(lang, "Request Free Edit", "Demander une retouche gratuite")}
        </button>
        {(plan.editRequests || []).length ? (
          <ul className="rs-studio-edit-history">
            {(plan.editRequests || []).map((r) => (
              <li key={r.id}>
                <span className="rs-studio-edit-history__id">#{r.id}</span>
                <span className="rs-studio-edit-history__status">{r.status}</span>
                <span
                  className={`rs-studio-edit-history__length${r.resumeLength === "2_pages" ? " is-two-page" : ""}`}
                >
                  {resumeLengthLabel(r.resumeLength)}
                </span>
                <span className="rs-studio-edit-history__date">{formatDate(r.requested_at)}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <footer className="rs-studio-workspace-card__foot">
        <button
          type="button"
          className="rs-btn-ghost"
          onClick={() => {
            const i = document.querySelector(`[data-rs-studio-upload-input="${plan.planId}"]`);
            if (i) i.click();
          }}
        >
          {L(lang, "Upload Files", "Televerser des fichiers")}
        </button>
        <Link href={plan.studioPath || "/studio"} className="rs-btn-accent">
          {t.clientHubOpenStudio}
        </Link>
      </footer>
    </article>
  );
}
