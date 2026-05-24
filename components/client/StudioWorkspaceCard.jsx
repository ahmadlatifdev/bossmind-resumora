import { useState } from "react";
import { ChevronDown, ChevronUp, Download, Eye, RefreshCw, Trash2 } from "lucide-react";
import StudioUpgradeControls from "@/components/client/StudioUpgradeControls";
import StudioUploadWorkspace from "@/components/client/StudioUploadWorkspace";

// ── No logic changes. All props, state, and handlers are purely
//    presentational refinements. Business logic lives in ClientStudioHub.
const L = (lang, en, fr) => (lang === "fr" ? fr : en);

// ── Status chip config ────────────────────────────────────────
function StatusChip({ status, lang }) {
  const map = {
    queued     : { label: { en: "Queued",      fr: "En attente"    }, cls: "rs-studio-badge--queued"    },
    processing : { label: { en: "Processing",  fr: "En traitement" }, cls: "rs-studio-badge--progress"  },
    generating : { label: { en: "Generating",  fr: "Generation"    }, cls: "rs-studio-badge--progress"  },
    ready      : { label: { en: "Ready",       fr: "Pret"          }, cls: "rs-studio-badge--ready"     },
    delivered  : { label: { en: "Delivered",   fr: "Livre"         }, cls: "rs-studio-badge--ready"     },
    revision   : { label: { en: "In revision", fr: "En revision"   }, cls: "rs-studio-badge--progress"  },
  };
  const cfg   = map[status] || map.queued;
  const label = cfg.label[lang] || cfg.label.en;
  return <span className={`rs-studio-badge ${cfg.cls}`}>{label}</span>;
}

// ── Compact section toggle ────────────────────────────────────
function SectionToggle({ open, onToggle, label }) {
  return (
    <button
      type="button"
      className="rs-studio-section-toggle"
      onClick={onToggle}
      aria-expanded={open}
    >
      <span>{label}</span>
      {open
        ? <ChevronUp size={14} strokeWidth={2} aria-hidden />
        : <ChevronDown size={14} strokeWidth={2} aria-hidden />}
    </button>
  );
}

// ── Document row ──────────────────────────────────────────────
function DocRow({ doc, docTypeLabels, lang, replacingId, busy, formatDate, onPreview, onDownload, onReplace, onRemove }) {
  const isReplacing = replacingId === doc.id;
  return (
    <li className="rs-studio-doc-row rs-studio-doc-row--v2">
      <div className="rs-studio-doc-row__icon" aria-hidden>
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
          <path d="M2.5 1.5h4.75L10 4v7.5a.5.5 0 01-.5.5h-7a.5.5 0 01-.5-.5v-10a.5.5 0 01.5-.5z"
            stroke="currentColor" strokeWidth="1" strokeLinejoin="round" />
          <path d="M7.25 1.5V4H10" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" />
        </svg>
      </div>
      <div className="rs-studio-doc-row__main">
        <span className="rs-studio-doc-row__name">{doc.original_name}</span>
        <span className="rs-studio-doc-row__meta">
          <span className="rs-studio-doc-row__type">{docTypeLabels[doc.doc_type] || doc.doc_type}</span>
          <span className="rs-studio-doc-row__sep" aria-hidden>·</span>
          <span className={`rs-studio-status-chip rs-studio-status-chip--${doc.status}`}>{doc.status}</span>
          <span className="rs-studio-doc-row__sep" aria-hidden>·</span>
          <span className="rs-studio-doc-row__date">{formatDate(doc.created_at)}</span>
        </span>
      </div>
      <div className="rs-studio-doc-row__actions">
        <button type="button" className="rs-studio-action-btn" title={L(lang,"Preview","Apercu")} onClick={onPreview}>
          <Eye size={13} strokeWidth={2} aria-hidden />
          <span className="rs-studio-action-btn__label">{L(lang,"Preview","Apercu")}</span>
        </button>
        <button type="button" className="rs-studio-action-btn" title={L(lang,"Download","Telecharger")} onClick={onDownload}>
          <Download size={13} strokeWidth={2} aria-hidden />
          <span className="rs-studio-action-btn__label">{L(lang,"Download","Telecharger")}</span>
        </button>
        <label className="rs-studio-action-btn rs-studio-action-btn--replace">
          <RefreshCw size={13} strokeWidth={2} aria-hidden />
          <span className="rs-studio-action-btn__label">
            {isReplacing ? L(lang,"Replacing…","Remplacement…") : L(lang,"Replace","Remplacer")}
          </span>
          <input type="file" className="rs-studio-file-input"
            disabled={isReplacing || busy} accept=".pdf,.doc,.docx"
            onChange={(e) => onReplace(e.target.files?.[0])} />
        </label>
        <button type="button" className="rs-studio-action-btn rs-studio-action-btn--danger"
          title={L(lang,"Remove","Supprimer")} onClick={onRemove}>
          <Trash2 size={13} strokeWidth={2} aria-hidden />
        </button>
      </div>
    </li>
  );
}

// ── Main component ────────────────────────────────────────────
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
  paymentConfirmed,
  onUploadFile,
  onReplaceDocument,
  onRemoveDocument,
  onRequestFreeEdit,
  ownedPlanIds,
  onOpenUpgrade,
  onReload,
  formatDate,
}) {
  const { planId, displayName, documents = [], generationStatus = "queued",
          freeEditsRemaining, freeEditsUsed, deliveryUrl, premiumLink } = plan;

  const [uploadOpen,   setUploadOpen]   = useState(true);
  const [editOpen,     setEditOpen]     = useState(false);

  const docs       = documents.filter((d) => d.status !== "removed");
  const hasResume  = docs.some((d) => d.doc_type === "resume");
  const isUploading= uploadingPlan === planId;
  const isRequesting = requestingPlan === planId;
  const notes      = editNotes[planId] || "";
  const resumeLen  = editResumeLength[planId] || "standard";
  const canSubmitEdit = notes.trim().length >= 8;
  const hasFreeEdits  = freeEditsRemaining != null ? freeEditsRemaining > 0 : true;

  // Generation pipeline steps
  const pipelineSteps = [
    { key: "intake",    en: "Document intake",   fr: "Intake documents",  done: hasResume },
    { key: "processing",en: "AI processing",     fr: "Traitement IA",     done: ["processing","generating","ready","delivered"].includes(generationStatus) },
    { key: "ready",     en: "Deliverable ready", fr: "Livrable pret",     done: ["ready","delivered"].includes(generationStatus) },
  ];

  return (
    <article className="rs-studio-workspace-card rs-studio-workspace-card--v2" data-plan-id={planId}>

      {/* ── Card header: title + status + upgrade ───────────── */}
      <div className="rs-studio-workspace-card__head">
        <div className="rs-studio-workspace-card__title-row">
          <div className="rs-studio-workspace-card__title-block">
            <h2 className="rs-studio-workspace-card__title">{displayName}</h2>
            <StatusChip status={generationStatus} lang={lang} />
          </div>
          <StudioUpgradeControls
            lang={lang}
            ownedPlanIds={ownedPlanIds}
            onOpen={onOpenUpgrade}
            compact
          />
        </div>

        {/* Pipeline timeline */}
        <div className="rs-studio-delivery-timeline rs-studio-delivery-timeline--v2">
          {pipelineSteps.map((step, i) => (
            <div
              key={step.key}
              className={`rs-studio-delivery-timeline__item${step.done ? " is-done" : i === pipelineSteps.findIndex(s => !s.done) ? " is-active" : ""}`}
            >
              <span className="rs-studio-delivery-timeline__dot" aria-hidden />
              <span>{lang === "fr" ? step.fr : step.en}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Delivery / download (when ready) ────────────────── */}
      {(deliveryUrl || premiumLink) && ["ready","delivered"].includes(generationStatus) ? (
        <div className="rs-studio-download-row rs-studio-download-row--compact">
          {deliveryUrl ? (
            <a href={deliveryUrl} className="rs-btn-accent rs-btn-accent--compact"
              target="_blank" rel="noopener noreferrer">
              {L(lang, "Download deliverable", "Telecharger le livrable")}
            </a>
          ) : null}
          {premiumLink ? (
            <a href={premiumLink} className="rs-btn-ghost rs-studio-premium-link"
              target="_blank" rel="noopener noreferrer">
              {L(lang, "View premium asset", "Voir l'actif premium")}
            </a>
          ) : null}
        </div>
      ) : null}

      {/* ── Upload section ───────────────────────────────────── */}
      <div className="rs-studio-panel rs-studio-panel--upload-primary rs-studio-panel--v2">
        <div className="rs-studio-panel__heading">
          <span>{L(lang, "Document intake", "Depot de documents")}</span>
          {docs.length > 0 && (
            <span className="rs-studio-doc-queue__count">{docs.length}</span>
          )}
          {docs.length > 0 && (
            <SectionToggle
              open={uploadOpen}
              onToggle={() => setUploadOpen(v => !v)}
              label={uploadOpen ? L(lang,"Collapse","Reduire") : L(lang,"Expand","Developper")}
            />
          )}
        </div>

        {(uploadOpen || docs.length === 0) && (
          <StudioUploadWorkspace
            planId={planId}
            lang={lang}
            documents={documents}
            docTypeLabels={docTypeLabels}
            docTypes={docTypes}
            setDocTypes={setDocTypes}
            isUploading={isUploading}
            replacingId={replacingId}
            guidedMode={showUploadWizard && !hasResume}
            onUploadFile={onUploadFile}
            onReplaceDocument={onReplaceDocument}
            onRemoveDocument={onRemoveDocument}
            onReload={onReload}
            formatDate={formatDate}
          />
        )}

        {!uploadOpen && docs.length > 0 && (
          <div className="rs-studio-doc-queue__collapsed-summary">
            <span className="rs-studio-doc-queue__title">
              {docs.length} {L(lang, docs.length === 1 ? "file" : "files", docs.length === 1 ? "fichier" : "fichiers")}
            </span>
          </div>
        )}
      </div>

      {/* ── Free edit section ─────────────────────────────────── */}
      {hasFreeEdits ? (
        <div className="rs-studio-panel rs-studio-panel--edit rs-studio-panel--v2">
          <div className="rs-studio-panel__heading">
            <span>
              {L(lang, "Free edit request", "Demande de modification gratuite")}
              {freeEditsRemaining != null && (
                <span className="rs-studio-generation-pill">
                  {freeEditsRemaining} {L(lang, "remaining", "restant(es)")}
                </span>
              )}
            </span>
            <SectionToggle
              open={editOpen}
              onToggle={() => setEditOpen(v => !v)}
              label={editOpen ? L(lang,"Collapse","Reduire") : L(lang,"Open","Ouvrir")}
            />
          </div>

          {editOpen && (
            <>
              {/* Resume length selector */}
              <fieldset className="rs-studio-edit-length">
                <legend className="rs-studio-edit-length__legend">
                  {L(lang, "Target length", "Longueur cible")}
                </legend>
                {[
                  { value: "standard", en: "Standard (1 page)", fr: "Standard (1 page)",
                    hint: { en: "Concise executive format", fr: "Format executif concis" } },
                  { value: "2_pages",  en: "Extended (2 pages)", fr: "Etendu (2 pages)",
                    hint: { en: "Senior / director level", fr: "Niveau directeur / senior" } },
                ].map((opt) => (
                  <label
                    key={opt.value}
                    className={`rs-studio-edit-length__option${opt.value === "2_pages" ? " rs-studio-edit-length__option--two-page" : ""}${resumeLen === opt.value ? " is-selected" : ""}`}
                  >
                    <input
                      type="radio"
                      name={`resume-length-${planId}`}
                      value={opt.value}
                      checked={resumeLen === opt.value}
                      onChange={() => setEditResumeLength((s) => ({ ...s, [planId]: opt.value }))}
                    />
                    <span className="rs-studio-edit-length__title">
                      {lang === "fr" ? opt.fr : opt.en}
                    </span>
                    <span className="rs-studio-edit-length__hint">
                      {lang === "fr" ? opt.hint.fr : opt.hint.en}
                    </span>
                  </label>
                ))}
              </fieldset>

              {/* Notes textarea */}
              <div className="rs-studio-field">
                <label className="rs-studio-field__label" htmlFor={`edit-notes-${planId}`}>
                  {L(lang, "Revision notes", "Notes de revision")}
                </label>
                <textarea
                  id={`edit-notes-${planId}`}
                  className="rs-studio-textarea"
                  rows={4}
                  placeholder={L(
                    lang,
                    "Describe the changes you need — specific sections, wording, formatting…",
                    "Decrivez les modifications — sections, formulation, mise en forme…"
                  )}
                  value={notes}
                  onChange={(e) => setEditNotes((s) => ({ ...s, [planId]: e.target.value }))}
                />
              </div>

              <button
                type="button"
                className="rs-btn-accent rs-studio-edit-cta"
                disabled={!canSubmitEdit || isRequesting}
                onClick={() => onRequestFreeEdit(planId)}
              >
                {isRequesting
                  ? L(lang, "Submitting…", "Envoi…")
                  : L(lang, "Submit revision request", "Soumettre la demande")}
              </button>
            </>
          )}
        </div>
      ) : null}

    </article>
  );
}
