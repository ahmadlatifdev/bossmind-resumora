import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { translations } from "@/lib/marketing/site-copy";

export default function ClientStudioHub({ lang }) {
  const t = translations[lang];
  const [state, setState] = useState("loading");
  const [hub, setHub] = useState(null);

  const load = useCallback(async () => {
    setState("loading");
    try {
      const res = await fetch(`/api/client/hub?lang=${lang}`, { credentials: "same-origin" });
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

  return (
    <div className="rs-client-hub" data-rs-client-hub="1">
      <header className="rs-client-hub-header">
        <h1>{t.clientHubTitle}</h1>
        <p>{t.clientHubLead}</p>
        {hub?.email ? <p className="rs-client-hub-email">{hub.email}</p> : null}
      </header>

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
            <div className="rs-client-hub-actions">
              <Link href={plan.studioPath} className="rs-btn-accent">
                {t.clientHubOpenStudio}
              </Link>
              {plan.welcomeDownloadUrl ? (
                <a href={plan.welcomeDownloadUrl} className="rs-btn-ghost" download>
                  {t.clientHubDownloadWelcome}
                </a>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
