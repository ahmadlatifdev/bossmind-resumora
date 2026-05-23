import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { translations } from "@/lib/marketing/site-copy";
import OnboardingProgress from "@/components/client/OnboardingProgress";
import StudioCalmPrepare from "@/components/client/StudioCalmPrepare";
import StudioWorkspaceCard from "@/components/client/StudioWorkspaceCard";
import StudioUpgradeDrawer from "@/components/client/StudioUpgradeDrawer";
import StudioUpgradeControls from "@/components/client/StudioUpgradeControls";
import { useStripeCheckout } from "@/lib/marketing/client-hooks";
import { hasUpgradeOffers } from "@/lib/client/studio-plan-upgrades";
import {
  runLuxuryCheckoutActivation,
  STUDIO_UI_HARD_TIMEOUT_MS,
} from "@/lib/client/luxury-checkout-client";
import {
  logCheckoutRuntime,
  recordRedirect,
  shouldBlockRedirect,
} from "@/lib/client/checkout-runtime";

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

function clearCheckoutFromUrl(router) {
  try {
    sessionStorage.removeItem("rs_last_checkout_session");
  } catch {
    /* ignore */
  }
  if (router?.replace) {
    router.replace("/studio", undefined, { shallow: true }).catch(() => {});
  }
}

export default function ClientStudioHub({ lang: langProp }) {
  const router = useRouter();
  const lang = langProp === "fr" ? "fr" : "en";
  const t = translations[lang] || translations.en;
  const [state, setState] = useState("loading");
  const [hub, setHub] = useState(null);
  const [journey, setJourney] = useState(null);
  const [toast, setToast] = useState("");
  const [checkoutVerify, setCheckoutVerify] = useState(null);
  const [showUploadWizard, setShowUploadWizard] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [recoveryDetail, setRecoveryDetail] = useState(null);
  const [activation, setActivation] = useState(null);
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const orchestrationRunRef = useRef(0);
  const orchestratedSidRef = useRef("");
  const hubStateRef = useRef("loading");
  const urlNormalizedRef = useRef(false);
  const loadRef = useRef(null);
  const loginRedirectCountRef = useRef(0);
  const activationAttemptsRef = useRef(0);
  const MAX_LOGIN_REDIRECTS = 2;
  const MAX_ACTIVATION_ATTEMPTS = 3;
  const accountEmailRef = useRef("");
  const [mounted, setMounted] = useState(false);
  const [uploadingPlan, setUploadingPlan] = useState("");
  const [requestingPlan, setRequestingPlan] = useState("");
  const [replacingId, setReplacingId] = useState(0);
  const [editNotes, setEditNotes] = useState({});
  const [editResumeLength, setEditResumeLength] = useState({});
  const [docTypes, setDocTypes] = useState({});
  const [upgradeDrawerOpen, setUpgradeDrawerOpen] = useState(false);
  const [upgradeDrawerMode, setUpgradeDrawerMode] = useState("all");
  const [upgradeSuccess, setUpgradeSuccess] = useState(null);
  const prevPlanIdsRef = useRef("");
  const { busyPlan, handleCheckout, checkoutError } = useStripeCheckout();

  const ownedPlanIds = useMemo(() => (hub?.plans || []).map((p) => p.planId), [hub?.plans]);

  const openUpgradeDrawer = useCallback((mode = "all") => {
    setUpgradeDrawerMode(mode);
    setUpgradeDrawerOpen(true);
  }, []);

  useEffect(() => {
    hubStateRef.current = state;
  }, [state]);

  useEffect(() => {
    setMounted(true);
  }, []);

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

  const applyActivationPayload = useCallback((data) => {
    if (data?.activation) setActivation(data.activation);
    if (data?.preload) preloadStudioAssets(data.preload);
    if (data?.stripeCheckoutEmail) {
      setRecoveryEmail(data.stripeCheckoutEmail);
      accountEmailRef.current = data.stripeCheckoutEmail;
    }
    if (data?.email) {
      accountEmailRef.current = data.email;
      setRecoveryEmail((prev) => prev || data.email);
    }
    if (data?.needsSignIn) setNeedsSignIn(true);
    else if (data?.signedIn && data?.hasAccess) setNeedsSignIn(false);
  }, []);

  const enterRecovery = useCallback(
    (detail = {}) => {
      const sid = resolveSessionId();
      logCheckoutRuntime("studio_recovery_shown", {
        failedStep: detail.failedStep || "unknown",
        activationStatus: detail.activationStatus,
        attempts: detail.attempts ?? activationAttemptsRef.current,
      });
      setRecoveryDetail({
        failedStep: detail.failedStep || "activation_incomplete",
        activationStatus: detail.activationStatus || "recovery_required",
        attempts: detail.attempts ?? activationAttemptsRef.current,
        stripeCheckoutEmail: detail.stripeCheckoutEmail || recoveryEmail || "",
        message: detail.message || "",
      });
      setState("recovery");
      setToast("");
      if (sid && router?.replace) {
        const target = "/studio?recovery=activation";
        if (!shouldBlockRedirect(router.asPath, target)) {
          recordRedirect(router.asPath, target);
          router.replace(target, undefined, { shallow: true }).catch(() => {});
        }
      }
    },
    [resolveSessionId, recoveryEmail, router]
  );

  const enterStudioFromPayload = useCallback(
    (data, sid) => {
      applyActivationPayload(data);
      const plans =
        data.plans?.length > 0
          ? data.plans
          : data.planId
            ? [
                {
                  planId: data.planId,
                  displayName: data.displayName || data.planId,
                  documents: [],
                  generationStatus: "queued",
                },
              ]
            : [];
      setHub({ ...data, plans });
      setState("ready");
      setShowUploadWizard(true);
      setNeedsSignIn(false);
      setCheckoutVerify({ status: "success", planId: data.planId, displayName: data.displayName });
      try {
        sessionStorage.removeItem("rs_last_checkout_session");
      } catch {
        /* ignore */
      }
      router.replace("/studio", "/studio", { shallow: false }).catch(() => {
        if (typeof window !== "undefined") window.location.assign("/studio");
      });
      return true;
    },
    [applyActivationPayload, router]
  );

  const load = useCallback(
    async (sessionId = "", { signal } = {}) => {
      const sid = sessionId || resolveSessionId();
      const pending = Boolean(sid) || hasPendingCheckout(router);

      setState((prev) => (prev === "ready" ? "ready" : "loading"));

      try {
        const qs = new URLSearchParams({ lang });
        if (sid) qs.set("session_id", sid);
        let endpoint = sid ? "/api/client/checkout-bootstrap" : "/api/client/workspace";
        let res = await fetch(`${endpoint}?${qs.toString()}`, {
          credentials: "same-origin",
          signal,
        });
        if (!res.ok && sid && endpoint.includes("checkout-bootstrap")) {
          await fetch(
            `/api/client/activate-plan?session_id=${encodeURIComponent(sid)}&lang=${encodeURIComponent(lang)}`,
            { credentials: "same-origin", signal }
          ).catch(() => {});
          endpoint = "/api/client/workspace";
          res = await fetch(`${endpoint}?${qs.toString()}`, { credentials: "same-origin", signal });
        }
        const data = await res.json();
        if (!res.ok) {
          setState("error");
          return false;
        }
        const studioReady =
          data.hasAccess || (data.signedIn && data.fulfillmentOk && data.planId);
        if (studioReady) applyActivationPayload(data);
        if (data.email) {
          accountEmailRef.current = data.email;
          setRecoveryEmail((prev) => prev || data.email);
        }
        if (data.stripeCheckoutEmail) {
          setRecoveryEmail((prev) => prev || data.stripeCheckoutEmail);
        }
        if (!data.signedIn) {
          setHub(data);
          const mustSignIn = pending && (data.needsSignIn || data.fulfillmentOk || data.planId);
          if (mustSignIn) {
            let postLogin = false;
            try {
              postLogin = sessionStorage.getItem("rs_post_login") === "1";
              if (postLogin) sessionStorage.removeItem("rs_post_login");
            } catch {
              /* ignore */
            }
            if (postLogin) {
              setTimeout(() => loadRef.current?.(sid), 500);
              return false;
            }
            if (loginRedirectCountRef.current >= MAX_LOGIN_REDIRECTS) {
              setToast(
                L(
                  lang,
                  "Sign in with the same email used at Stripe checkout, then refresh this page.",
                  "Connectez-vous avec le meme email que pour le paiement Stripe, puis actualisez."
                )
              );
              setState("error");
              return false;
            }
            loginRedirectCountRef.current += 1;
            const next = sid ? `/studio?session_id=${encodeURIComponent(sid)}` : "/studio";
            const loginTarget = `/login?next=${encodeURIComponent(next)}`;
            if (!shouldBlockRedirect(router.asPath, loginTarget)) {
              recordRedirect(router.asPath, loginTarget);
              logCheckoutRuntime("studio_redirect_login", { next });
              router.replace(loginTarget).catch(() => {});
            } else {
              enterRecovery({ failedStep: "redirect_loop", activationStatus: "needs_sign_in" });
            }
          }
          setState("auth");
          return false;
        }
        if (studioReady) {
          const plans =
            data.plans?.length > 0
              ? data.plans
              : data.planId
                ? [
                    {
                      planId: data.planId,
                      displayName: data.displayName || data.planId,
                      documents: [],
                      generationStatus: "queued",
                    },
                  ]
                : [];
          setHub({ ...data, plans });
          setState("ready");
          setShowUploadWizard(true);
          setNeedsSignIn(false);
          if (pending) clearCheckoutFromUrl(router);
          return true;
        }
        if (pending) {
          setHub({ ...data, plans: data.plans || [] });
          if (activationAttemptsRef.current >= MAX_ACTIVATION_ATTEMPTS) {
            enterRecovery({
              failedStep: data.failedStep || "entitlement_missing",
              activationStatus: data.activationStatus,
            });
          } else {
            setState("loading");
          }
          return false;
        }
        setHub(data);
        setState("no_plan");
        return false;
      } catch (err) {
        if (err?.name === "AbortError") return false;
        setState("error");
        return false;
      }
    },
    [lang, router, resolveSessionId, applyActivationPayload, enterRecovery]
  );

  const signInHref = useMemo(() => {
    const sid = resolveSessionId();
    const next = sid ? `/studio?session_id=${encodeURIComponent(sid)}` : "/studio";
    return `/login?next=${encodeURIComponent(next)}`;
  }, [resolveSessionId]);

  const docTypeLabels = useMemo(
    () => Object.fromEntries(DOC_TYPE_OPTIONS.map((x) => [x.key, lang === "fr" ? x.fr : x.en])),
    [lang]
  );

  useEffect(() => {
    if (!mounted) return;
    if (!router.isReady || urlNormalizedRef.current) return;
    const sid = firstQuery(router.query.session_id) || getStoredSessionId();
    if (!sid) return;
    if (firstQuery(router.query.checkout) === "success") {
      urlNormalizedRef.current = true;
      persistSessionId(sid);
      router.replace(`/studio?session_id=${encodeURIComponent(sid)}`, undefined, { shallow: true }).catch(() => {});
    }
  }, [router.isReady, router.query.checkout, router.query.session_id, router, mounted]);

  loadRef.current = load;

  useEffect(() => {
    if (!mounted || !router.isReady) return;

    const runId = ++orchestrationRunRef.current;
    const sid = firstQuery(router.query.session_id) || getStoredSessionId();
    const recoveryQuery = firstQuery(router.query.recovery);

    if (!sid) {
      orchestratedSidRef.current = "";
      if (recoveryQuery) {
        setState("recovery");
        setRecoveryDetail((d) => d || { failedStep: recoveryQuery, activationStatus: "recovery_required" });
        return;
      }
      (async () => {
        setState("loading");
        await load("");
      })();
      return;
    }

    orchestratedSidRef.current = sid;
    activationAttemptsRef.current += 1;
    persistSessionId(sid);
    logCheckoutRuntime("studio_session_id_received", { sessionIdPrefix: sid.slice(0, 20), attempt: activationAttemptsRef.current });

    const ac = new AbortController();
    const timeoutId = setTimeout(() => ac.abort(), STUDIO_UI_HARD_TIMEOUT_MS);

    (async () => {
      setState("loading");
      setRecoveryDetail(null);

      const outcome = await runLuxuryCheckoutActivation(sid, lang, { signal: ac.signal });
      if (runId !== orchestrationRunRef.current) return;

      const data = outcome.data || {};
      if (data.stripeCheckoutEmail) setRecoveryEmail(data.stripeCheckoutEmail);

      if (outcome.status === "complete") {
        logCheckoutRuntime("studio_entitlement_activated", { planId: data.planId });
        enterStudioFromPayload(data, sid);
        await refreshJourney();
        return;
      }

      if (outcome.status === "email_mismatch") {
        setToast(
          L(
            lang,
            `Sign in with ${data.stripeCheckoutEmail || "your Stripe checkout email"} to unlock your workspace.`,
            `Connectez-vous avec ${data.stripeCheckoutEmail || "l'email du paiement Stripe"} pour activer votre espace.`
          )
        );
        if (loginRedirectCountRef.current < MAX_LOGIN_REDIRECTS) {
          loginRedirectCountRef.current += 1;
          const target = data.redirectTo || signInHref;
          if (!shouldBlockRedirect(router.asPath, target)) {
            recordRedirect(router.asPath, target);
            router.replace(target).catch(() => {});
          } else {
            enterRecovery({ ...data, failedStep: "auth_email_mismatch", attempts: outcome.attempts });
          }
        } else {
          enterRecovery({ ...data, failedStep: "auth_email_mismatch", attempts: outcome.attempts });
        }
        return;
      }

      if (outcome.status === "needs_sign_in" && !data?.signedIn) {
        if (loginRedirectCountRef.current >= MAX_LOGIN_REDIRECTS) {
          enterRecovery({ ...data, failedStep: "needs_sign_in", attempts: outcome.attempts });
          return;
        }
        loginRedirectCountRef.current += 1;
        const target =
          data.redirectTo || `/login?next=${encodeURIComponent(`/studio?session_id=${encodeURIComponent(sid)}`)}`;
        if (!shouldBlockRedirect(router.asPath, target)) {
          recordRedirect(router.asPath, target);
          router.replace(target).catch(() => {});
        } else {
          enterRecovery({ ...data, failedStep: "redirect_loop", attempts: outcome.attempts });
        }
        return;
      }

      if (outcome.status === "recovery" || outcome.status === "timeout") {
        const loaded = await load(sid);
        if (loaded) return;
        enterRecovery({
          ...data,
          failedStep: data.failedStep || (outcome.status === "timeout" ? "client_timeout" : "activation_failed"),
          attempts: outcome.attempts,
        });
        return;
      }

      if (outcome.status === "activation_pending") {
        const loaded = await load(sid);
        if (loaded) return;
        if (activationAttemptsRef.current >= MAX_ACTIVATION_ATTEMPTS) {
          enterRecovery({
            ...data,
            failedStep: data.failedStep || "activation_pending",
            attempts: outcome.attempts,
          });
        } else {
          enterRecovery({
            ...data,
            failedStep: data.failedStep || "stripe_unconfigured",
            attempts: outcome.attempts,
            message: L(
              lang,
              "We received your payment but could not verify it on this server yet. Use recovery below or sign in with your checkout email.",
              "Paiement recu — verification impossible sur ce serveur. Utilisez la recuperation ci-dessous."
            ),
          });
        }
        return;
      }

      const loaded = await load(sid);
      if (loaded) return;
      enterRecovery({ ...data, failedStep: data.failedStep || "activation_incomplete", attempts: outcome.attempts });
    })();

    return () => {
      clearTimeout(timeoutId);
      ac.abort();
    };
  }, [router.isReady, router.query.session_id, router.query.recovery, lang, enterStudioFromPayload, refreshJourney, router, signInHref, enterRecovery, mounted]);

  useEffect(() => {
    if (!mounted || !router.isReady) return;
    const sid = resolveSessionId();
    if (!sid) return;

    const timer = setTimeout(() => {
      if (hubStateRef.current === "loading" || hubStateRef.current === "auth") {
        enterRecovery({
          failedStep: "client_timeout",
          activationStatus: "recovery_required",
          attempts: activationAttemptsRef.current,
          message: L(
            lang,
            "Activation is taking longer than expected. Use the options below to continue.",
            "L'activation prend plus de temps que prevu. Utilisez les options ci-dessous."
          ),
        });
      }
    }, STUDIO_UI_HARD_TIMEOUT_MS + 400);

    return () => clearTimeout(timer);
  }, [router.isReady, router.query.session_id, lang, enterRecovery, resolveSessionId, mounted]);

  useEffect(() => {
    if (!mounted || state !== "ready") return;
    refreshJourney();
  }, [state, refreshJourney]);

  useEffect(() => {
    if (state !== "ready" || !hub?.plans?.length) return;
    const key = hub.plans
      .map((p) => p.planId)
      .sort()
      .join(",");
    const prev = prevPlanIdsRef.current;
    if (prev && key !== prev) {
      const prevSet = new Set(prev.split(",").filter(Boolean));
      const added = hub.plans.find((p) => !prevSet.has(p.planId));
      if (added) {
        setUpgradeSuccess({
          planId: added.planId,
          displayName: added.displayName || added.planId,
        });
        logCheckoutRuntime("studio_upgrade_entitlement_added", { planId: added.planId });
      }
    }
    prevPlanIdsRef.current = key;
  }, [state, hub?.plans]);

  useEffect(() => {
    if (checkoutVerify?.status !== "success") return;
    setUpgradeSuccess({
      planId: checkoutVerify.planId || "",
      displayName: checkoutVerify.displayName || checkoutVerify.planId || "",
    });
  }, [checkoutVerify?.status, checkoutVerify?.displayName, checkoutVerify?.planId]);

  useEffect(() => {
    if (state !== "loading" && state !== "ready") return;
    preloadStudioAssets({
      studio: "/studio",
      onboarding: `/api/client/onboarding?lang=${lang}`,
      essentialAdvanced: "/studio/essential-advanced",
    });
  }, [state, lang]);

  useEffect(() => {
    if (state !== "no_plan" || !hub?.email) return;
    const ac = new AbortController();
    (async () => {
      try {
        const r = await fetch(
          `/api/client/checkout-recovery?email=${encodeURIComponent(hub.email)}&lang=${lang}`,
          { credentials: "same-origin", signal: ac.signal }
        );
        const j = await r.json();
        if (j.recovered) await load(resolveSessionId(), { signal: ac.signal });
      } catch {
        /* silent */
      }
    })();
    return () => ac.abort();
  }, [state, hub?.email, lang, load, resolveSessionId]);

  async function retryCheckoutActivation() {
    const sid = resolveSessionId();
    if (!sid) {
      enterRecovery({ failedStep: "missing_session_id" });
      return;
    }
    if (activationAttemptsRef.current >= MAX_ACTIVATION_ATTEMPTS) {
      enterRecovery({ failedStep: "max_attempts", attempts: activationAttemptsRef.current });
      return;
    }
    orchestratedSidRef.current = "";
    orchestrationRunRef.current += 1;
    activationAttemptsRef.current += 1;
    setState("loading");
    setRecoveryDetail(null);
    logCheckoutRuntime("studio_activation_retry", { attempt: activationAttemptsRef.current });
    const ac = new AbortController();
    const outcome = await runLuxuryCheckoutActivation(sid, lang, { signal: ac.signal });
    const data = outcome.data || {};
    if (outcome.status === "complete") {
      enterStudioFromPayload(data, sid);
      await refreshJourney();
      return;
    }
    if (outcome.status === "needs_sign_in" && !data?.signedIn) {
      router.replace(signInHref).catch(() => {});
      return;
    }
    const loaded = await load(sid);
    if (!loaded) {
      enterRecovery({
        ...data,
        failedStep: data.failedStep || outcome.status,
        attempts: outcome.attempts,
      });
    }
  }

  async function recoverWorkspaceByEmail() {
    const email = recoveryEmail.trim();
    if (!email.includes("@")) return;
    setState("loading");
    const r = await fetch(`/api/client/checkout-recovery?email=${encodeURIComponent(email)}&lang=${lang}`, {
      credentials: "same-origin",
    });
    const j = await r.json();
    if (j.recovered) {
      await load(resolveSessionId());
      await refreshJourney();
    } else {
      setToast(L(lang, "Still verifying your purchase with Stripe.", "Verification de votre achat avec Stripe en cours."));
    }
  }

  useEffect(() => {
    if (state !== "ready" || !hub?.plans?.length) return;
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
        .then(() => load(resolveSessionId()))
        .catch(() => {});
    }, 10000);
    return () => clearInterval(tick);
  }, [state, hub, load, resolveSessionId]);

  if (!mounted || !router.isReady) {
    return (
      <div className="rs-client-hub rs-client-hub--calm-prepare">
        <StudioCalmPrepare lang={lang} />
      </div>
    );
  }

  if (state === "recovery") {
    const step = recoveryDetail?.failedStep || "activation_incomplete";
    const recoveryMessage =
      recoveryDetail?.message ||
      (step === "stripe_unconfigured"
        ? L(
            lang,
            "Payment verification is temporarily unavailable on this server. Sign in with your Stripe checkout email or contact support@resumora.net.",
            "La verification du paiement est temporairement indisponible. Connectez-vous avec l'email Stripe ou contactez support@resumora.net."
          )
        : step === "payment_not_paid" || step === "session"
          ? L(
              lang,
              "This checkout session is invalid or expired. Start a new plan from pricing or contact support with your receipt.",
              "Cette session de paiement est invalide ou expiree. Reprenez depuis les forfaits ou contactez le support."
            )
          : L(
              lang,
              "We could not unlock your studio automatically. Try recovery below or sign in with the email used at checkout.",
              "Impossible d'ouvrir le studio automatiquement. Utilisez la recuperation ci-dessous."
            ));

    return (
      <div className="rs-client-hub rs-client-hub--recovery rs-simple-card rs-studio-recovery-card">
        <p className="rs-post-payment-activation-eyebrow">
          {L(lang, "Workspace recovery", "Recuperation de l'espace")}
        </p>
        <h1>{L(lang, "Let's get your studio open", "Ouvrons votre studio")}</h1>
        <p className="rs-post-payment-activation-sub">{recoveryMessage}</p>
        {recoveryDetail?.stripeCheckoutEmail ? (
          <p className="rs-client-hub-email">
            {L(lang, "Checkout email", "Email de paiement")}: <strong>{recoveryDetail.stripeCheckoutEmail}</strong>
          </p>
        ) : null}
        <p className="rs-client-hub-email">
          {L(lang, "Diagnostic", "Diagnostic")}: <code>{step}</code>
          {recoveryDetail?.attempts ? ` · ${L(lang, "Attempts", "Tentatives")}: ${recoveryDetail.attempts}` : ""}
        </p>
        <label className="rs-studio-field rs-client-hub-recovery-email">
          <span className="rs-studio-field__label">{L(lang, "Email used at checkout", "Email utilise au paiement")}</span>
          <input
            type="email"
            className="rs-input"
            value={recoveryEmail}
            onChange={(e) => setRecoveryEmail(e.target.value)}
            placeholder="you@company.com"
          />
        </label>
        <div className="rs-post-payment-activation-actions">
          <button type="button" className="rs-btn-accent" onClick={() => retryCheckoutActivation()}>
            {L(lang, "Retry activation", "Reessayer l'activation")}
          </button>
          <button type="button" className="rs-btn-ghost" onClick={() => recoverWorkspaceByEmail()}>
            {L(lang, "Recover by email", "Recuperer par email")}
          </button>
          <Link href={signInHref} className="rs-btn-ghost">
            {L(lang, "Sign in", "Connexion")}
          </Link>
          <Link href="/pricing#pricing" className="rs-btn-ghost">
            {L(lang, "View pricing", "Voir les forfaits")}
          </Link>
        </div>
      </div>
    );
  }

  if (state === "loading") {
    return (
      <div className="rs-client-hub rs-client-hub--calm-prepare">
        <StudioCalmPrepare lang={lang} />
      </div>
    );
  }

  if (state === "auth") {
    return (
      <div className="rs-client-hub rs-client-hub--calm-prepare">
        <StudioCalmPrepare lang={lang} />
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

  if (state === "no_plan" && hasPendingCheckout(router)) {
    return (
      <div className="rs-client-hub rs-client-hub--calm-prepare">
        <StudioCalmPrepare lang={lang} />
      </div>
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
            "Activate an executive plan below — Stripe checkout opens in-app without leaving your studio.",
            "Activez un forfait executif ci-dessous — paiement Stripe dans le studio, sans navigation externe."
          )}
        </p>
        <div className="rs-studio-dashboard-bar rs-studio-dashboard-bar--empty">
          <StudioUpgradeControls lang={lang} ownedPlanIds={[]} onOpen={openUpgradeDrawer} />
        </div>
        <StudioUpgradeDrawer
          open={upgradeDrawerOpen}
          mode={upgradeDrawerMode}
          lang={lang}
          ownedPlanIds={[]}
          busyPlan={busyPlan}
          checkoutError={checkoutError}
          onClose={() => setUpgradeDrawerOpen(false)}
          onSelectPlan={(planId, planName, planPrice) => {
            setUpgradeDrawerOpen(false);
            handleCheckout(planId, planName, planPrice);
          }}
        />
      </div>
    );
  }

  async function uploadFile(planId, file, docTypeOverride) {
    if (!file) return;
    setUploadingPlan(planId);
    const form = new FormData();
    form.append("file", file);
    form.append("planId", planId);
    form.append("docType", docTypeOverride || docTypes[planId] || "supporting_file");
    try {
      await fetch("/api/client/documents", {
        method: "POST",
        credentials: "same-origin",
        body: form,
      });
      setToast(L(lang, "Upload saved.", "Televersement enregistre."));
      await load(resolveSessionId(), {});
    } finally {
      setUploadingPlan("");
    }
  }

  async function removeDocument(docId) {
    if (typeof window !== "undefined" && !window.confirm(L(lang, "Remove this uploaded document?", "Supprimer ce document televerse ?"))) return;
    await fetch(`/api/client/documents?id=${encodeURIComponent(docId)}&confirm=yes`, {
      method: "DELETE",
      credentials: "same-origin",
    });
    setToast(L(lang, "Document removed.", "Document supprime."));
    await load(resolveSessionId(), {});
  }

  async function requestFreeEdit(planId) {
    const notes = String(editNotes[planId] || "").trim();
    if (notes.length < 8) return;
    setRequestingPlan(planId);
    try {
      const resumeLength = editResumeLength[planId] === "2_pages" ? "2_pages" : "standard";
      await fetch("/api/client/edit-requests", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId, notes, resumeLength }),
      });
      setEditNotes((s) => ({ ...s, [planId]: "" }));
      setEditResumeLength((s) => ({ ...s, [planId]: "standard" }));
      await load(resolveSessionId(), {});
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
      await load(resolveSessionId(), {});
    } finally {
      setReplacingId(0);
    }
  }

  return (
    <div className="rs-client-hub rs-studio-workspace" data-rs-client-hub="1">
      <header className="rs-client-hub-header rs-studio-workspace__header">
        <p className="rs-eyebrow">{L(lang, "Executive client workspace", "Espace client executif")}</p>
        <h1>{t.clientHubTitle}</h1>
        <p className="rs-client-hub-lead">{t.clientHubLead}</p>
        {hub?.email ? <p className="rs-client-hub-email">{hub.email}</p> : null}
        <p className="rs-client-hub-email">
          {L(lang, "Support", "Support")}:{" "}
          <a className="rs-shell-link" href={`mailto:${hub?.supportEmail || "support@resumora.net"}`}>
            {hub?.supportEmail || "support@resumora.net"}
          </a>
        </p>
      </header>

      {upgradeSuccess ? (
        <div className="rs-studio-upgrade-success" role="status">
          <span className="rs-studio-upgrade-success__badge" aria-hidden>
            ✦
          </span>
          <div>
            <strong>{L(lang, "New executive service activated", "Nouveau service executif active")}</strong>
            <p>
              {L(lang, "Workspace updated", "Espace mis a jour")}: <strong>{upgradeSuccess.displayName}</strong>
            </p>
          </div>
          <button type="button" className="rs-studio-action-btn" onClick={() => setUpgradeSuccess(null)}>
            {L(lang, "Dismiss", "Fermer")}
          </button>
        </div>
      ) : null}

      {checkoutVerify?.status === "success" && !upgradeSuccess ? (
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
              "Upload your documents below to begin generation — add more services anytime from this studio.",
              "Televersez vos documents ci-dessous — ajoutez des services depuis ce studio."
            )}
          </p>
        </div>
      ) : null}

      {state === "ready" && hasUpgradeOffers(ownedPlanIds, "all") ? (
        <div className="rs-studio-dashboard-bar">
          <div className="rs-studio-dashboard-bar__copy">
            <p className="rs-eyebrow">{L(lang, "Billing & upgrades", "Facturation et mises a niveau")}</p>
            <p className="rs-studio-dashboard-bar__lead">
              {L(
                lang,
                "Add executive services without leaving your workspace — Stripe checkout opens in one click.",
                "Ajoutez des services executifs sans quitter votre espace — paiement Stripe en un clic."
              )}
            </p>
          </div>
          <StudioUpgradeControls lang={lang} ownedPlanIds={ownedPlanIds} onOpen={openUpgradeDrawer} />
        </div>
      ) : null}

      {journey?.progress?.steps?.length && checkoutVerify?.status !== "success" ? (
        <OnboardingProgress steps={journey.progress.steps} percent={journey.progress.percent} lang={lang} />
      ) : null}
      {toast ? (
        <p className="rs-upload-toast" role="status">
          {toast}
        </p>
      ) : null}

      <div className="rs-client-hub-grid rs-studio-workspace__grid">
        {(hub?.plans || []).map((plan) => (
          <StudioWorkspaceCard
            key={plan.planId}
            plan={plan}
            lang={lang}
            t={t}
            docTypeLabels={docTypeLabels}
            docTypes={docTypes}
            setDocTypes={setDocTypes}
            uploadingPlan={uploadingPlan}
            replacingId={replacingId}
            requestingPlan={requestingPlan}
            editNotes={editNotes}
            setEditNotes={setEditNotes}
            editResumeLength={editResumeLength}
            setEditResumeLength={setEditResumeLength}
            showUploadWizard={showUploadWizard}
            router={router}
            paymentConfirmed={checkoutVerify?.status === "success"}
            onUploadFile={uploadFile}
            onReplaceDocument={replaceDocument}
            onRemoveDocument={removeDocument}
            onRequestFreeEdit={requestFreeEdit}
            ownedPlanIds={ownedPlanIds}
            onOpenUpgrade={openUpgradeDrawer}
            onReload={() => load(resolveSessionId(), {})}
            formatDate={formatDate}
          />
        ))}
      </div>

      <StudioUpgradeDrawer
        open={upgradeDrawerOpen}
        mode={upgradeDrawerMode}
        lang={lang}
        ownedPlanIds={ownedPlanIds}
        busyPlan={busyPlan}
        checkoutError={checkoutError}
        onClose={() => setUpgradeDrawerOpen(false)}
        onSelectPlan={(planId, planName, planPrice) => {
          setUpgradeDrawerOpen(false);
          handleCheckout(planId, planName, planPrice);
        }}
      />
    </div>
  );
}
