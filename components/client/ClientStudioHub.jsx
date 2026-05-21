import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { translations } from "@/lib/marketing/site-copy";
import OnboardingProgress from "@/components/client/OnboardingProgress";
import UploadWizard from "@/components/client/UploadWizard";
import PostPaymentActivation from "@/components/client/PostPaymentActivation";

const DOC_TYPE_OPTIONS = [
  { key: "resume", en: "Resume", fr: "CV" },
  { key: "cover_letter", en: "Cover letter", fr: "Lettre de motivation" },
  { key: "linkedin_notes", en: "LinkedIn/profile notes", fr: "Notes LinkedIn/profil" },
  { key: "credentials", en: "Credentials/certificates", fr: "Diplomes/certifications" },
  { key: "job_description", en: "Job description", fr: "Description de poste" },
  { key: "supporting_file", en: "Supporting files", fr: "Fichiers supplementaires" },
];

const L = (lang, en, fr) => (lang === "fr" ? fr : en);
const MAX_ACTIVATION_ATTEMPTS = 5;
const ACTIVATION_RETRY_MS = 3000;

function firstQuery(value) {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return "";
}

function getStoredSessionId() {
  if (typeof sessionStorage === "undefined") return "";
  try {
    return sessionStorage.getItem("rs_last_checkout_session") || "";
  } catch {
    return "";
  }
}

function persistSessionId(sid) {
  if (!sid || typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem("rs_last_checkout_session", sid);
  } catch {
    /* ignore */
  }
}

function preloadStudioAssets(preload) {
  if (typeof document === "undefined" || !preload) return;
  const urls = [preload.onboarding, preload.studio, preload.essentialAdvanced].filter(Boolean);
  for (const href of urls) {
    if (document.querySelector(`link[data-rs-preload="${href}"]`)) continue;
    const link = document.createElement("link");
    link.rel = "prefetch";
    link.href = href;
    link.setAttribute("data-rs-preload", href);
    document.head.appendChild(link);
  }
}

function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

function hasPendingCheckout(router) {
  const sid = firstQuery(router.query.session_id) || getStoredSessionId();
  return Boolean(sid) || firstQuery(router.query.checkout) === "success";
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
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [activation, setActivation] = useState(null);
  const [luxuryStages, setLuxuryStages] = useState(null);
  const [conciergeMessage, setConciergeMessage] = useState("");
  const [progressPercent, setProgressPercent] = useState(null);
  const [activationAttempt, setActivationAttempt] = useState(0);
  const activationRunRef = useRef(0);
  const [uploadingPlan, setUploadingPlan] = useState("");
  const [requestingPlan, setRequestingPlan] = useState("");
  const [replacingId, setReplacingId] = useState(0);
  const [editNotes, setEditNotes] = useState({});
  const [docTypes, setDocTypes] = useState({});

  const resolveSessionId = useCallback(() => {
    const fromQuery = firstQuery(router.query.session_id);
    return fromQuery || getStoredSessionId();
  }, [router.query.session_id]);

  const refreshJourney = useCallback(async () => {
    try {
      const r = await fetch(`/api/client/onboarding?lang=${lang}`, { credentials: "same-origin" });
      const j = await r.json();
      setJourney(j);
    } catch {
      /* ignore */
    }
  }, [lang]);

  const load = useCallback(
    async (sessionId = "", { skipActivatingGate = false } = {}) => {
      const sid = sessionId || resolveSessionId();
      const pending = Boolean(sid) || hasPendingCheckout(router);

      if (!skipActivatingGate && pending) {
        setState("activating");
      } else {
        setState("loading");
      }

      try {
        const qs = new URLSearchParams({ lang });
        if (sid) qs.set("session_id", sid);
        const res = await fetch(`/api/client/workspace?${qs.toString()}`, { credentials: "same-origin" });
        const data = await res.json();
        if (!res.ok) {
          setState("error");
          return;
        }
        if (data.activation) setActivation(data.activation);
        if (!data.signedIn) {
          setState("auth");
          setHub(data);
          return;
        }
        if (data.hasAccess) {
          setHub(data);
          setState("ready");
          setShowUploadWizard(true);
          return;
        }
        if (pending) {
          setHub(data);
          setState("activating");
          return;
        }
        setHub(data);
        setState("no_plan");
      } catch {
        setState("error");
      }
    },
    [lang, router, resolveSessionId]
  );

  const runActivationAttempt = useCallback(async () => {
    const sid = resolveSessionId();
    if (!sid) return { ok: false };

    const res = await fetch(
      `/api/client/activate-plan?session_id=${encodeURIComponent(sid)}&lang=${encodeURIComponent(lang)}`,
      { credentials: "same-origin" }
    );
    const data = await res.json();
    if (data.activation) setActivation(data.activation);
    if (Array.isArray(data.luxuryStages)) setLuxuryStages(data.luxuryStages);
    if (data.conciergeMessage) setConciergeMessage(data.conciergeMessage);
    if (typeof data.progressPercent === "number") setProgressPercent(data.progressPercent);
    if (data.preload) preloadStudioAssets(data.preload);

    if (data.hasAccess || data.fulfillmentOk) {
      persistSessionId(sid);
      const qs = new URLSearchParams({ lang, session_id: sid });
      const ws = await fetch(`/api/client/workspace?${qs.toString()}`, { credentials: "same-origin" });
      const wsData = await ws.json();
      if (wsData.activation) setActivation(wsData.activation);
      if (wsData.hasAccess) {
        setHub(wsData);
        setState("ready");
        setShowUploadWizard(true);
        setCheckoutVerify({
          status: "success",
          planId: data.planId,
          displayName: data.displayName,
        });
        setToast(
          L(
            lang,
            "Your secure workspace is ready. Upload your documents to begin.",
            "Votre espace securise est pret. Televersez vos documents pour commencer."
          )
        );
        await refreshJourney();
        return { ok: true };
      }
    }

    if (hub?.email) {
      const emailRes = await fetch(
        `/api/client/checkout-recovery?email=${encodeURIComponent(hub.email)}&lang=${lang}`,
        { credentials: "same-origin" }
      );
      const emailData = await emailRes.json();
      if (emailData.recovered) {
        return load(sid, { skipActivatingGate: true });
      }
    }

    return { ok: false };
  }, [lang, resolveSessionId, hub?.email, load, refreshJourney]);

  useEffect(() => {
    if (!router.isReady) return;
    const sid = firstQuery(router.query.session_id);
    if (sid) persistSessionId(sid);
    load(sid);
  }, [router.isReady, router.query.session_id, load]);

  useEffect(() => {
    refreshJourney();
  }, [refreshJourney]);

  useEffect(() => {
    if (state !== "activating" && state !== "loading") return;
    preloadStudioAssets({
      studio: "/studio",
      onboarding: `/api/client/onboarding?lang=${lang}`,
      essentialAdvanced: "/studio/essential-advanced",
    });
  }, [state, lang]);

  useEffect(() => {
    if (state !== "no_plan" || !hub?.email) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(
          `/api/client/checkout-recovery?email=${encodeURIComponent(hub.email)}&lang=${lang}`,
          { credentials: "same-origin" }
        );
        const j = await r.json();
        if (!cancelled && j.recovered) await load(resolveSessionId(), { skipActivatingGate: true });
      } catch {
        /* silent */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [state, hub?.email, lang, load, resolveSessionId]);

  useEffect(() => {
    if (state !== "activating") return;

    const runId = ++activationRunRef.current;
    let cancelled = false;

    (async () => {
      for (let i = 0; i < MAX_ACTIVATION_ATTEMPTS; i++) {
        if (cancelled || activationRunRef.current !== runId) return;
        setActivationAttempt(i + 1);
        const result = await runActivationAttempt();
        if (result?.ok) return;
        if (i < MAX_ACTIVATION_ATTEMPTS - 1) {
          await new Promise((r) => setTimeout(r, ACTIVATION_RETRY_MS));
        }
      }
      if (!cancelled && activationRunRef.current === runId) {
        setState("activation_failed");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [state, runActivationAttempt]);

  useEffect(() => {
    if (!router.isReady) return;
    if (firstQuery(router.query.checkout) !== "success") return;
    const sid = firstQuery(router.query.session_id);
    if (!sid) return;

    persistSessionId(sid);
    setState("activating");
    setCheckoutVerify({ status: "pending" });
    router.replace("/studio", undefined, { shallow: true }).catch(() => {});
  }, [router.isReady, router.query.checkout, router.query.session_id, router]);

  async function manualRecoverPurchase() {
    setState("activating");
    setActivationAttempt(0);
    activationRunRef.current += 1;
    const result = await runActivationAttempt();
    if (!result?.ok) {
      for (let i = 0; i < MAX_ACTIVATION_ATTEMPTS; i++) {
        setActivationAttempt(i + 1);
        const r = await runActivationAttempt();
        if (r?.ok) return;
        await new Promise((res) => setTimeout(res, ACTIVATION_RETRY_MS));
      }
      setState("activation_failed");
    }
  }

  async function recoverWorkspaceByEmail() {
    const email = recoveryEmail.trim();
    if (!email.includes("@")) return;
    setState("activating");
    const r = await fetch(`/api/client/checkout-recovery?email=${encodeURIComponent(email)}&lang=${lang}`, {
      credentials: "same-origin",
    });
    const j = await r.json();
    if (j.recovered) {
      await load(resolveSessionId(), { skipActivatingGate: true });
      await refreshJourney();
    } else {
      setState("activation_failed");
      setToast(L(lang, "No purchase found for this email.", "Aucun achat trouve pour ce courriel."));
    }
  }

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
        .then(() => load(resolveSessionId(), { skipActivatingGate: true }))
        .catch(() => {});
    }, 4000);
    return () => clearInterval(tick);
  }, [hub, load, resolveSessionId]);

  if (state === "loading" && hasPendingCheckout(router)) {
    return (
      <PostPaymentActivation
        lang={lang}
        attempt={0}
        maxAttempts={MAX_ACTIVATION_ATTEMPTS}
        activation={activation}
      />
    );
  }

  if (state === "loading") {
    return (
      <div className="rs-client-hub rs-client-hub--loading">
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
        {hasPendingCheckout(router) ? (
          <PostPaymentActivation
            lang={lang}
            attempt={activationAttempt}
            activation={activation}
            luxuryStages={luxuryStages}
            conciergeMessage={conciergeMessage}
            progressPercent={progressPercent}
          />
        ) : null}
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="rs-client-hub">
        <p>{t.clientHubError}</p>
        <button type="button" className="rs-btn-ghost" onClick={() => load(resolveSessionId())}>
          {t.clientHubRetry}
        </button>
      </div>
    );
  }

  if (state === "activating") {
    return (
      <PostPaymentActivation
        lang={lang}
        attempt={activationAttempt}
        activation={activation}
        luxuryStages={luxuryStages}
        conciergeMessage={conciergeMessage}
        progressPercent={progressPercent}
      />
    );
  }

  if (state === "activation_failed") {
    return (
      <PostPaymentActivation
        lang={lang}
        attempt={activationAttempt}
        activation={activation}
        luxuryStages={luxuryStages}
        conciergeMessage={conciergeMessage}
        progressPercent={progressPercent}
        failed
        onRecover={manualRecoverPurchase}
        recoveryEmail={recoveryEmail}
        onRecoveryEmailChange={setRecoveryEmail}
        onEmailRecover={recoverWorkspaceByEmail}
      />
    );
  }

  if (state === "no_plan") {
    return (
      <div className="rs-client-hub rs-client-hub--no-plan rs-client-hub--premium-prep">
        <p className="rs-post-payment-activation-eyebrow">
          {L(lang, "Resumora Executive Studio", "Studio executif Resumora")}
        </p>
        <h1>{L(lang, "Your secure workspace awaits", "Votre espace securise vous attend")}</h1>
        <p className="rs-post-payment-activation-sub">
          {L(
            lang,
            "Select an executive plan to activate upload channels, resume generation, and complimentary edits.",
            "Selectionnez un forfait executif pour activer televersement, generation CV et retouches incluses."
          )}
        </p>
        <p className="rs-post-payment-activation-concierge">
          {L(
            lang,
            "Already purchased? We are checking your account for entitlements automatically.",
            "Deja achete? Verification automatique de vos droits sur votre compte."
          )}
        </p>
        <div className="rs-post-payment-activation-actions">
          <Link href="/pricing#pricing" className="rs-btn-accent">
            {L(lang, "Choose a Plan", "Choisir un forfait")}
          </Link>
          <button type="button" className="rs-btn-ghost" onClick={manualRecoverPurchase}>
            {L(lang, "Recover Purchase", "Recuperer l'achat")}
          </button>
          <Link href="/login" className="rs-btn-ghost">
            {L(lang, "Sign in", "Connexion")}
          </Link>
        </div>
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
      await load(resolveSessionId(), { skipActivatingGate: true });
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
    await load(resolveSessionId(), { skipActivatingGate: true });
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
      await load(resolveSessionId(), { skipActivatingGate: true });
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
      await load(resolveSessionId(), { skipActivatingGate: true });
    } finally {
      setReplacingId(0);
    }
  }

  const docTypeLabels = useMemo(
    () => Object.fromEntries(DOC_TYPE_OPTIONS.map((x) => [x.key, lang === "fr" ? x.fr : x.en])),
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

      {checkoutVerify?.status === "success" ? (
        <div className="rs-payment-confirmed-banner" role="status">
          <strong>{L(lang, "Payment confirmed", "Paiement confirme")}</strong>
          {checkoutVerify.displayName ? (
            <p>
              {L(lang, "Plan activated", "Forfait active")}: <strong>{checkoutVerify.displayName}</strong>
            </p>
          ) : null}
          <p>
            {L(
              lang,
              "Your invoice confirmation has been sent. Upload your documents below to begin generation.",
              "Votre confirmation de facture a ete envoyee. Televersez vos documents ci-dessous."
            )}
          </p>
        </div>
      ) : null}

      {journey?.progress?.steps?.length ? (
        <OnboardingProgress steps={journey.progress.steps} percent={journey.progress.percent} lang={lang} />
      ) : null}
      {toast ? (
        <p className="rs-upload-toast" role="status">
          {toast}
        </p>
      ) : null}

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
                onUpload={() => load(resolveSessionId(), { skipActivatingGate: true })}
                onComplete={() => load(resolveSessionId(), { skipActivatingGate: true })}
              />
            ) : null}
            {plan.planId === "essential_advanced" ? (
              <div className="rs-premium-dashboard">
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
              <div className="rs-client-hub-delivery">
                <p>
                  <strong>{L(lang, "Delivery status", "Statut de livraison")}:</strong> {plan.delivery.status}
                </p>
                {plan.delivery.message ? <p>{plan.delivery.message}</p> : null}
                {plan.delivery?.download_url || plan.generationStatus === "ready" ? (
                  <div className="rs-delivery-downloads">
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
                    <strong>{doc.original_name}</strong> · {docTypeLabels[doc.doc_type] || doc.doc_type} · {doc.status}{" "}
                    · {formatDate(doc.created_at)}
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
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
