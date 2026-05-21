import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { translations } from "@/lib/marketing/site-copy";
import OnboardingProgress from "@/components/client/OnboardingProgress";
import UploadWizard from "@/components/client/UploadWizard";

const DOC_TYPE_OPTIONS = [
  { key: "resume", en: "Resume", fr: "CV" },
  { key: "cover_letter", en: "Cover letter", fr: "Lettre de motivation" },
  { key: "linkedin_notes", en: "LinkedIn/profile notes", fr: "Notes LinkedIn/profil" },
  { key: "credentials", en: "Credentials/certificates", fr: "Diplomes/certifications" },
  { key: "job_description", en: "Job description", fr: "Description de poste" },
  { key: "supporting_file", en: "Supporting files", fr: "Fichiers supplementaires" },
];

const L = (lang, en, fr) => (lang === "fr" ? fr : en);

function firstQuery(value) {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return "";
}

function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

export default function ClientStudioHub({ lang }) {
  const router = useRouter();
  const t = translations[lang];
  const [state, setState] = useState("loading");
  const [hub, setHub] = useState(null);
  const [journey, setJourney] = useState(null);
  const [toast, setToast] = useState("");
  const [checkoutVerify, setCheckoutVerify] = useState(null);
  const [showUploadWizard, setShowUploadWizard] = useState(false);
  const [uploadingPlan, setUploadingPlan] = useState("");
  const [requestingPlan, setRequestingPlan] = useState("");
  const [replacingId, setReplacingId] = useState(0);
  const [editNotes, setEditNotes] = useState({});
  const [docTypes, setDocTypes] = useState({});

  const load = useCallback(async () => {
    setState("loading");
    try {
      const res = await fetch(`/api/client/workspace?lang=${lang}`, { credentials: "same-origin" });
      const data = await res.json();
      if (!res.ok) {
        setState("error");
        return;
      }
      if (!data.signedIn) {
        setState("auth");
        setHub(data);
        return;
      }
      setHub(data);
      setState(data.hasAccess ? "ready" : "empty");
    } catch {
      setState("error");
    }
  }, [lang]);

  useEffect(() => {
    load();
  }, [load]);

  const refreshJourney = useCallback(async () => {
    try {
      const r = await fetch(`/api/client/onboarding?lang=${lang}`, { credentials: "same-origin" });
      const j = await r.json();
      setJourney(j);
    } catch {
      /* ignore */
    }
  }, [lang]);

  useEffect(() => {
    refreshJourney();
  }, [refreshJourney]);

  useEffect(() => {
    if (!router.isReady) return;
    if (firstQuery(router.query.checkout) !== "success") return;
    const sid = firstQuery(router.query.session_id);
    if (!sid) return;

    setCheckoutVerify({ status: "pending" });
    fetch(`/api/verify-session?session_id=${encodeURIComponent(sid)}&lang=${encodeURIComponent(lang)}`, {
      credentials: "same-origin",
    })
      .then((r) => r.json())
      .then(async (data) => {
        setCheckoutVerify({
          status: data.valid ? "success" : "invalid",
          planId: data.planId,
          displayName: data.displayName,
          freeEditsLabel: data.freeEditsLabel,
          invoiceReference: data.invoiceReference,
        });
        if (data.valid) {
          setShowUploadWizard(true);
          setToast(
            L(lang, "Payment confirmed. Upload your documents to begin.", "Paiement confirme. Televersez vos documents.")
          );
          await load();
          await refreshJourney();
        }
        router.replace("/studio", undefined, { shallow: true }).catch(() => {});
      })
      .catch(() => setCheckoutVerify({ status: "error" }));
  }, [router.isReady, router.query.checkout, router.query.session_id, lang, load, refreshJourney, router]);

  useEffect(() => {
    if (!hub?.plans?.length) return;
    const plan = hub.plans[0];
    const hasResume = (plan.documents || []).some((d) => d.doc_type === "resume" && d.status !== "removed");
    if (!hasResume) return;
    const gen = plan.generationStatus || "queued";
    if (gen === "ready") return;
    const tick = setInterval(() => {
      fetch("/api/client/generation-status", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: plan.planId }),
      })
        .then(() => load())
        .catch(() => {});
    }, 4000);
    return () => clearInterval(tick);
  }, [hub, load]);

  if (state === "loading") {
    return (
      <div className="rs-client-hub">
        <p>{t.clientHubLoading}</p>
      </div>
    );
  }

  if (state === "auth") {
    return (
      <div className="rs-client-hub">
        <h1>{t.clientHubAuthTitle}</h1>
        <p>{t.clientHubAuthLead}</p>
        <Link href="/login" className="rs-btn-accent">
          {t.clientHubAuthCta}
        </Link>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="rs-client-hub">
        <p>{t.clientHubError}</p>
        <button type="button" className="rs-btn-ghost" onClick={load}>
          {t.clientHubRetry}
        </button>
      </div>
    );
  }

  if (state === "empty") {
    return (
      <div className="rs-client-hub">
        <h1>{t.clientHubEmptyTitle}</h1>
        <p>{t.clientHubEmptyLead}</p>
        <Link href="/pricing#pricing" className="rs-btn-accent">
          {t.clientHubEmptyCta}
        </Link>
      </div>
    );
  }

  async function uploadFile(planId, file) {
    if (!file) return;
    setUploadingPlan(planId);
    const form = new FormData();
    form.append("file", file);
    form.append("planId", planId);
    form.append("docType", docTypes[planId] || "supporting_file");
    try {
      await fetch("/api/client/documents", {
        method: "POST",
        credentials: "same-origin",
        body: form,
      });
      setToast(L(lang, "Upload saved.", "Televersement enregistre."));
      await load();
    } finally {
      setUploadingPlan("");
    }
  }

  async function removeDocument(docId) {
    if (!window.confirm(L(lang, "Remove this uploaded document?", "Supprimer ce document televerse ?"))) return;
    await fetch(`/api/client/documents?id=${encodeURIComponent(docId)}&confirm=yes`, {
      method: "DELETE",
      credentials: "same-origin",
    });
    setToast(L(lang, "Document removed.", "Document supprime."));
    await load();
  }

  async function requestFreeEdit(planId) {
    const notes = String(editNotes[planId] || "").trim();
    if (notes.length < 8) return;
    setRequestingPlan(planId);
    try {
      await fetch("/api/client/edit-requests", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId, notes }),
      });
      setEditNotes((s) => ({ ...s, [planId]: "" }));
      await load();
    } finally {
      setRequestingPlan("");
    }
  }

  async function replaceDocument(planId, docId, file) {
    if (!file) return;
    setReplacingId(docId);
    const form = new FormData();
    form.append("file", file);
    form.append("planId", planId);
    try {
      await fetch(`/api/client/documents?id=${encodeURIComponent(docId)}`, {
        method: "PUT",
        credentials: "same-origin",
        body: form,
      });
      await load();
    } finally {
      setReplacingId(0);
    }
  }

  const docTypeLabels = useMemo(
    () =>
      Object.fromEntries(
        DOC_TYPE_OPTIONS.map((x) => [x.key, lang === "fr" ? x.fr : x.en])
      ),
    [lang]
  );

  return (
    <div className="rs-client-hub" data-rs-client-hub="1">
      <header className="rs-client-hub-header">
        <h1>{t.clientHubTitle}</h1>
        <p>{t.clientHubLead}</p>
        {hub?.email ? <p className="rs-client-hub-email">{hub.email}</p> : null}
        <p className="rs-client-hub-email">
          {L(lang, "Support", "Support")}:{" "}
          <a href={`mailto:${hub?.supportEmail || "support@resumora.net"}`}>{hub?.supportEmail || "support@resumora.net"}</a>
        </p>
      </header>

      {checkoutVerify?.status === "pending" ? (
        <p className="rs-payment-confirmed-banner rs-payment-confirmed-banner--pending" role="status">
          {L(lang, "Verifying your payment…", "Verification du paiement…")}
        </p>
      ) : null}
      {checkoutVerify?.status === "success" ? (
        <div className="rs-payment-confirmed-banner" role="status">
          <strong>{L(lang, "Payment confirmed", "Paiement confirme")}</strong>
          {checkoutVerify.displayName ? (
            <p>
              {L(lang, "Plan", "Forfait")}: {checkoutVerify.displayName}
              {checkoutVerify.freeEditsLabel ? ` · ${checkoutVerify.freeEditsLabel}` : ""}
            </p>
          ) : null}
          <p>
            {L(
              lang,
              "Next: upload your resume and job description using the guided steps below.",
              "Etape suivante : televersez votre CV et la description de poste ci-dessous."
            )}
          </p>
        </div>
      ) : null}
      {checkoutVerify?.status === "invalid" || checkoutVerify?.status === "error" ? (
        <p className="rs-payment-confirmed-banner rs-payment-confirmed-banner--warn" role="alert">
          {L(lang, "We could not verify this payment session. Contact support if you were charged.", "Impossible de verifier cette session. Contactez le support si vous avez ete debite.")}
        </p>
      ) : null}

      {journey?.progress?.steps?.length ? (
        <OnboardingProgress steps={journey.progress.steps} percent={journey.progress.percent} lang={lang} />
      ) : null}
      {journey?.next?.path ? (
        <p className="rs-client-hub-continue">
          <Link href={journey.next.path} className="rs-btn-accent">
            {journey.next.label || L(lang, "Continue", "Continuer")}
          </Link>
        </p>
      ) : null}
      {toast ? <p className="rs-upload-toast" role="status">{toast}</p> : null}

      <div className="rs-client-hub-grid">
        {hub.plans.map((plan) => (
          <article key={plan.planId} className="rs-client-hub-card" data-plan={plan.planId}>
            <h2>{plan.displayName}</h2>
            {plan.freeEditsLabel ? (
              <p className="rs-client-hub-free-edits">
                {t.clientHubFreeEdits}: <strong>{plan.freeEditsLabel}</strong>
              </p>
            ) : null}
            <ul className="rs-client-hub-features">
              {plan.features.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
            <p className="rs-client-hub-free-edits">
              {L(lang, "Free edits remaining", "Retouches gratuites restantes")}:{" "}
              <strong>{plan.freeEdits?.remaining ?? 0}</strong>
              {" / "}
              {plan.freeEdits?.included ?? 0}
            </p>
            {plan.progressTracker ? (
              <div className="rs-client-hub-delivery">
                <p>
                  <strong>{L(lang, "Onboarding progress", "Progression onboarding")}:</strong>{" "}
                  {plan.progressTracker.percent}%
                </p>
                <ol className="rs-client-hub-files">
                  {plan.progressTracker.steps.map((s) => (
                    <li key={s.key}>
                      {s.done ? "✓" : "○"} {s.label}
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}
            {(plan.delivery?.status === "ready" || plan.generationStatus === "ready") ? (
              <div className="rs-resume-ready-banner" role="status">
                {L(lang, "Resume Ready — download your deliverables below.", "CV pret — telechargez vos livrables ci-dessous.")}
              </div>
            ) : null}
            {plan.generationStatus ? (
              <div className="rs-generation-tracker">
                <p>
                  <strong>{L(lang, "Generation", "Generation")}:</strong> {plan.generationStatus}
                  {plan.generationMeta?.stageMessage ? ` — ${plan.generationMeta.stageMessage}` : ""}
                </p>
              </div>
            ) : null}
            {showUploadWizard ||
            router.query?.onboarding === "upload" ||
            !(plan.documents || []).some((d) => d.doc_type === "resume") ? (
              <UploadWizard
                lang={lang}
                planId={plan.planId}
                documents={plan.documents || []}
                onUpload={() => load()}
                onComplete={() => load()}
              />
            ) : null}
            {plan.planId === "essential_advanced" ? (
              <div className="rs-premium-dashboard">
                <h3>{L(lang, "Essential Advanced Premium", "Essential Advanced Premium")}</h3>
                <p>{L(lang, "3 interview videos · Q&A library · 20 tips · EN/FR delivery", "3 videos · bibliotheque Q&R · 20 conseils · livraison EN/FR")}</p>
                <Link href="/studio/essential-advanced" className="rs-btn-accent">
                  {L(lang, "Open Premium Studio", "Ouvrir le studio premium")}
                </Link>
              </div>
            ) : null}
            {plan.delivery ? (
              <div className="rs-client-hub-delivery">
                <p>
                  <strong>{L(lang, "Delivery status", "Statut de livraison")}:</strong>{" "}
                  {plan.delivery.status}
                </p>
                {plan.delivery.message ? <p>{plan.delivery.message}</p> : null}
                {plan.delivery.download_url ? (
                  <a href={plan.delivery.download_url} className="rs-btn-ghost">
                    {L(lang, "Download latest resume", "Telecharger le CV")}
                  </a>
                ) : null}
              </div>
            ) : (
              <p>{L(lang, "Delivery status: In progress", "Statut de livraison : en cours")}</p>
            )}
            <div className="rs-client-hub-upload">
              <h3>{L(lang, "Secure uploads", "Televersements securises")}</h3>
              <label>
                {L(lang, "Document type", "Type de document")}
                <select
                  value={docTypes[plan.planId] || "supporting_file"}
                  onChange={(e) => setDocTypes((s) => ({ ...s, [plan.planId]: e.target.value }))}
                >
                  {DOC_TYPE_OPTIONS.map((opt) => (
                    <option key={opt.key} value={opt.key}>
                      {lang === "fr" ? opt.fr : opt.en}
                    </option>
                  ))}
                </select>
              </label>
              <input
                type="file"
                onChange={(e) => uploadFile(plan.planId, e.target.files?.[0])}
                disabled={uploadingPlan === plan.planId}
              />
              <p>{L(lang, "Uploaded files", "Fichiers televerses")}</p>
              <ul className="rs-client-hub-files">
                {(plan.documents || []).map((doc) => (
                  <li key={doc.id}>
                    <strong>{doc.original_name}</strong> · {docTypeLabels[doc.doc_type] || doc.doc_type} ·{" "}
                    {doc.status} · {formatDate(doc.created_at)}
                    {" · "}
                    <a href={`/api/client/file?id=${encodeURIComponent(doc.id)}&mode=preview`} target="_blank" rel="noreferrer">
                      {L(lang, "Preview", "Apercu")}
                    </a>
                    {" · "}
                    <a href={`/api/client/file?id=${encodeURIComponent(doc.id)}&mode=download`}>
                      {L(lang, "Download", "Telecharger")}
                    </a>
                    {" · "}
                    <label style={{ display: "inline-block" }}>
                      {L(lang, "Replace", "Remplacer")}
                      <input
                        type="file"
                        style={{ display: "none" }}
                        onChange={(e) => replaceDocument(plan.planId, doc.id, e.target.files?.[0])}
                        disabled={replacingId === doc.id}
                      />
                    </label>
                    <button type="button" className="rs-btn-ghost" onClick={() => removeDocument(doc.id)}>
                      {L(lang, "Remove", "Supprimer")}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rs-client-hub-edits">
              <h3>{L(lang, "Request Free Edit", "Demander une retouche gratuite")}</h3>
              <textarea
                value={editNotes[plan.planId] || ""}
                onChange={(e) => setEditNotes((s) => ({ ...s, [plan.planId]: e.target.value }))}
                placeholder={L(
                  lang,
                  "Describe required updates to your resume deliverable...",
                  "Decrivez les modifications demandees..."
                )}
              />
              <button
                type="button"
                className="rs-btn-accent"
                onClick={() => requestFreeEdit(plan.planId)}
                disabled={requestingPlan === plan.planId || (plan.freeEdits?.remaining ?? 0) <= 0}
              >
                {L(lang, "Request Free Edit", "Demander une retouche gratuite")}
              </button>
              <ul className="rs-client-hub-files">
                {(plan.editRequests || []).map((r) => (
                  <li key={r.id}>
                    #{r.id} · {r.status} · {formatDate(r.requested_at)}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rs-client-hub-actions">
              <button
                type="button"
                className="rs-btn-ghost"
                onClick={() => {
                  const i = document.querySelector(`article[data-plan="${plan.planId}"] input[type="file"]`);
                  if (i) i.click();
                }}
              >
                {L(lang, "Upload Files", "Televerser des fichiers")}
              </button>
              <Link href={plan.studioPath} className="rs-btn-accent">
                {t.clientHubOpenStudio}
              </Link>
              {plan.welcomeDownloadUrl ? (
                <a href={plan.welcomeDownloadUrl} className="rs-btn-ghost" download>
                  {t.clientHubDownloadWelcome}
                </a>
              ) : null}
              <a href={`mailto:${hub?.supportEmail || "support@resumora.net"}?subject=${encodeURIComponent("Resumora Support")}`} className="rs-btn-ghost">
                {L(lang, "Contact Support", "Contacter le support")}
              </a>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
