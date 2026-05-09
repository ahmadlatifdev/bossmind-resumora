"use client";

import Head from "next/head";
import { useState } from "react";
import SiteChrome from "@/components/marketing/SiteChrome";
import { useLanguage } from "@/context/LanguageContext";
import { chatPageCopy } from "@/lib/marketing/legal-copy";
import { translations } from "@/lib/marketing/site-copy";

export default function ChatPage() {
  const { lang } = useLanguage();
  const t = translations[lang];
  const c = chatPageCopy(lang);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState("idle");

  async function onSubmit(e) {
    e.preventDefault();
    setStatus("sending");
    try {
      const res = await fetch("/api/support-intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, message, lang }),
      });
      if (!res.ok) throw new Error("fail");
      setStatus("ok");
      setMessage("");
    } catch {
      setStatus("err");
    }
  }

  return (
    <SiteChrome>
      <Head>
        <title>{c.title}</title>
        <meta name="description" content={c.meta} />
      </Head>
      <main className="rs-section">
        <div className="rs-container rs-legal-wrap">
          <p className="rs-eyebrow">{t.footerSupport}</p>
          <h1 className="rs-page-title">{c.title}</h1>
          <p className="rs-lead">{c.lead}</p>
          <p className="rs-footer-sub" style={{ marginTop: "0.75rem" }}>
            {c.automated}
          </p>

          <form className="rs-chat-form" onSubmit={onSubmit}>
            <label className="rs-chat-label">
              <span>{c.formEmail}</span>
              <input className="rs-input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            </label>
            <label className="rs-chat-label">
              <span>{c.formMessage}</span>
              <textarea className="rs-input rs-chat-textarea" required rows={5} value={message} onChange={(e) => setMessage(e.target.value)} />
            </label>
            <button type="submit" className="rs-btn-accent" disabled={status === "sending"}>
              {status === "sending" ? "…" : c.formSubmit}
            </button>
            {status === "ok" ? (
              <p className="rs-upload-status" data-state="ok" role="status">
                {c.formThanks}
              </p>
            ) : null}
            {status === "err" ? (
              <p className="rs-upload-status" data-state="err" role="alert">
                {lang === "en" ? "Could not send. Email support@resumora.net directly." : "Envoi impossible. Écrivez à support@resumora.net."}
              </p>
            ) : null}
          </form>
        </div>
      </main>
    </SiteChrome>
  );
}
