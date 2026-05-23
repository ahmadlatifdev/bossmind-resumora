import Link from "next/link";
import { CheckCircle2, Clock, FileText, Sparkles } from "lucide-react";
import { UPLOAD_WIZARD_STEPS } from "@/lib/client/upload-wizard-steps";
import StudioUploadWorkspace from "@/components/client/StudioUploadWorkspace";
import StudioUpgradeControls from "@/components/client/StudioUpgradeControls";

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

function isGuidedIntakeActive(plan, docs, showUploadWizard, router) {
  const uploadedTypes = new Set(docs.filter((d) => d.status !== "removed").map((d) => d.doc_type));
  const requiredDone = UPLOAD_WIZARD_STEPS.filter((s) => s.required).every((s) => uploadedTypes.has(s.docType));
  if (requiredDone) return false;
  const hasResume = docs.some((d) => d.doc_type === "resume" && d.status !== "removed");
  return showUploadWizard || router.query?.onboarding === "upload" || !hasResume;
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
  paymentConfirmed = false,
  ownedPlanIds = [],
  onOpenUpgrade,
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
  const guidedMode = isGuidedIntakeActive(plan, docs, showUploadWizard, router);
  const isReady = plan.delivery?.status === "ready" || plan.generationStatus === "ready";
  const showCompactProgress =
    plan.progressTracker && plan.progressTracker.percent < 100 && !isReady && !paymentConfirmed;

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
          <div className="rs-studio-workspace-card__title-block">
            <h2 className="rs-studio-workspace-card__title">{plan.displayName}</h2>
            <span className={badge.className}>
              <BadgeIcon size={14} strokeWidth={2} aria-hidden />
              {badge.label}
            </span>
          </div>
          {onOpenUpgrade ? (
            <StudioUpgradeControls
              lang={lang}
              ownedPlanIds={ownedPlanIds}
              onOpen={onOpenUpgrade}
              compact
            />
          ) : null}
        </div>
        <p className="rs-studio-workspace-card__meta">
          {plan.freeEditsLabel ? (
            <>
              {t.clientHubFreeEdits}: <strong>{plan.freeEditsLabel}</strong>
              <span className="rs-studio-workspace-card__meta-sep">·</span>
            </>
          ) : null}
          {L(lang, "Free edits remaining", "Retouches gratuites restantes")}:{" "}
          <strong>{plan.freeEdits?.remaining ?? 0}</strong> / {plan.freeEdits?.included ?? 0}
        </p>
      </header>

      <div className="rs-studio-status-rail">
        {plan.generationStatus ? (
          <span className="rs-studio-status-rail__item">
            {L(lang, "Generation", "Generation")}
            <span className="rs-studio-generation-pill">{plan.generationStatus}</span>
          </span>
        ) : null}
        {plan.delivery?.status ? (
          <span className="rs-studio-status-rail__item">
            {L(lang, "Delivery", "Livraison")}
            <span className="rs-studio-generation-pill">{plan.delivery.status}</span>
          </span>
        ) : null}
        {isReady ? (
          <span className="rs-studio-status-rail__ready">
            {L(lang, "Deliverables ready for download", "Livrables prets au telechargement")}
          </span>
        ) : null}
      </div>

      <div className="rs-studio-delivery-timeline" aria-label={L(lang, "Delivery progress", "Progression de livraison")}>
        {[
          {
            key: "started",
            en: "Resume generation started",
            fr: "Generation du CV commencee",
            active: ["queued", "analyzing", "generating"].includes(plan.generationStatus),
            done: plan.documents?.length > 0,
          },
          {
            key: "review",
            en: "Executive review in progress",
            fr: "Revue executive en cours",
            active: ["reviewing", "finalizing"].includes(plan.generationStatus),
            done: ["ready", "reviewing", "finalizing"].includes(plan.generationStatus),
          },
          {
            key: "ready",
            en: "Delivery ready",
            fr: "Livraison prete",
            active: isReady,
            done: isReady,
          },
          {
            key: "download",
            en: "Download package available",
            fr: "Forfait telechargeable disponible",
            active: isReady && Boolean(plan.delivery?.download_url),
            done: isReady && Boolean(plan.delivery?.download_url),
          },
        ].map((step) => (
          <div
            key={step.key}
            className={`rs-studio-delivery-timeline__item${step.active ? " is-active" : ""}${step.done ? " is-done" : ""}`}
          >
            <span className="rs-studio-delivery-timeline__dot" aria-hidden />
            {L(lang, step.en, step.fr)}
          </div>
        ))}
      </div>

      {showCompactProgress ? (
        <div className="rs-studio-progress-compact">
          <div className="rs-studio-progress-bar">
            <div className="rs-studio-progress-bar__fill" style={{ width: `${plan.progressTracker.percent}%` }} />
          </div>
          <span className="rs-studio-progress-compact__label">{plan.progressTracker.percent}%</span>
        </div>
      ) : null}

      {isReady && (plan.delivery?.download_url || plan.generationStatus === "ready") ? (
        <div className="rs-studio-download-row rs-studio-download-row--compact">
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

      {plan.planId === "essential_advanced" ? (
        <p className="rs-studio-premium-link">
          <Link href="/studio/essential-advanced" className="rs-shell-link">
            {L(lang, "Open Essential Advanced Premium Studio →", "Ouvrir le studio Essential Advanced →")}
          </Link>
        </p>
      ) : null}

      <section className="rs-studio-panel rs-studio-panel--upload-primary">
        <h3 className="rs-studio-panel__heading">
          <FileText size={18} strokeWidth={1.75} aria-hidden />
          {L(lang, "Secure document upload", "Televersement securise de documents")}
        </h3>
        <StudioUploadWorkspace
          planId={plan.planId}
          lang={lang}
          documents={docs}
          docTypeLabels={docTypeLabels}
          docTypes={docTypes}
          setDocTypes={setDocTypes}
          isUploading={isUploading}
          replacingId={replacingId}
          guidedMode={guidedMode}
          onUploadFile={onUploadFile}
          onReplaceDocument={onReplaceDocument}
          onRemoveDocument={onRemoveDocument}
          onReload={onReload}
          formatDate={formatDate}
        />
      </section>

      <section className="rs-studio-panel rs-studio-panel--edit">
        <h3 className="rs-studio-panel__heading rs-studio-panel__heading--secondary">
          {L(lang, "Request Free Edit", "Demander une retouche gratuite")}
        </h3>
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
          className="rs-btn-ghost rs-studio-edit-cta"
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
      </section>
    </article>
  );
}
