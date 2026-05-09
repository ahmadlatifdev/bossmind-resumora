"use client";

/**
 * BossMind Preview Manager — mount from `_app.js` only when NODE_ENV === 'development'.
 * Copy `PreviewManager.jsx`, `styles/dev-preview.css`, and `pages/api/health.js` into other Next.js apps.
 * IDE panels (Cursor/Windsurf) are outside the DOM; this stays on top within the browser preview only.
 */

import "@/styles/dev-preview.css";

import { Copy, ExternalLink, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { PREVIEW_POLL_INTERVAL_MS, PREVIEW_SLOW_MS } from "@/lib/dev/preview-config";

function PreviewBar({
  fullUrl,
  statusDotClass,
  statusLabel,
  health,
  openPreview,
  copyLink,
  restartHint,
}) {
  return (
    <>
      <span className={statusDotClass} title={statusLabel} aria-hidden />
      <span className="rs-dev-label">Local preview</span>
      <Link href={fullUrl} className="rs-dev-url" target="_blank" rel="noopener noreferrer">
        {fullUrl}
      </Link>
      <span className="rs-dev-status-text">
        {statusLabel}
        {health.latencyMs != null ? ` · ${health.latencyMs}ms` : ""}
      </span>
      <div className="rs-dev-actions">
        <button type="button" className="rs-dev-btn" onClick={openPreview}>
          <ExternalLink size={13} aria-hidden /> Open
        </button>
        <button type="button" className="rs-dev-btn" onClick={copyLink}>
          <Copy size={13} aria-hidden /> Copy
        </button>
        <button type="button" className="rs-dev-btn" onClick={restartHint}>
          <RefreshCw size={13} aria-hidden /> Restart
        </button>
      </div>
    </>
  );
}

export default function PreviewManager() {
  const router = useRouter();
  const [origin, setOrigin] = useState("");
  const [toast, setToast] = useState("");
  const toastTimer = useRef(null);

  const [health, setHealth] = useState({
    phase: "initial",
    latencyMs: null,
  });

  const showToast = useCallback((msg) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2600);
  }, []);

  useEffect(() => {
    document.documentElement.classList.add("rs-dev-preview-shell");
    return () => document.documentElement.classList.remove("rs-dev-preview-shell");
  }, []);

  useEffect(() => {
    setOrigin(typeof window !== "undefined" ? window.location.origin : "");
  }, [router.asPath]);

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      const start = performance.now();
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), PREVIEW_SLOW_MS + 5000);
        const res = await fetch("/api/health", {
          cache: "no-store",
          signal: ctrl.signal,
        });
        clearTimeout(timer);
        const latencyMs = Math.round(performance.now() - start);
        if (cancelled) return;
        if (!res.ok) {
          setHealth({ phase: "dead", latencyMs });
          return;
        }
        const slow = latencyMs >= PREVIEW_SLOW_MS;
        setHealth({ phase: slow ? "slow" : "live", latencyMs });
      } catch {
        if (!cancelled) setHealth({ phase: "dead", latencyMs: null });
      }
    };

    poll();
    const id = setInterval(poll, PREVIEW_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [router.asPath]);

  const statusDotClass = useMemo(() => {
    if (health.phase === "live") return "rs-dev-dot rs-dev-dot--live";
    if (health.phase === "slow") return "rs-dev-dot rs-dev-dot--busy";
    if (health.phase === "initial") return "rs-dev-dot rs-dev-dot--busy";
    return "rs-dev-dot rs-dev-dot--dead";
  }, [health.phase]);

  const statusLabel = useMemo(() => {
    if (health.phase === "live") return "Running";
    if (health.phase === "slow") return "Rebuilding / slow response";
    if (health.phase === "initial") return "Connecting…";
    return "Stopped / unreachable";
  }, [health.phase]);

  const fullUrl = origin || (typeof window !== "undefined" ? window.location.origin : "http://localhost:3000");

  const openPreview = useCallback(() => {
    if (typeof window === "undefined") return;
    window.open(window.location.origin, "_blank", "noopener,noreferrer");
  }, []);

  const copyLink = useCallback(async () => {
    if (typeof window === "undefined") return;
    try {
      await navigator.clipboard.writeText(window.location.origin);
      showToast("Link copied to clipboard");
    } catch {
      showToast("Copy failed — select URL manually");
    }
  }, [showToast]);

  const restartHint = useCallback(() => {
    showToast("Restart: Ctrl+C in terminal, then npm run dev");
    if (typeof window === "undefined") return;
    // eslint-disable-next-line no-alert -- dev-only
    window.alert(
      "Restart dev server:\n1. Focus the terminal running Next.js\n2. Press Ctrl+C\n3. Run: npm run dev\n\n(Browsers cannot safely restart Node from the page.)"
    );
  }, [showToast]);

  const barProps = {
    fullUrl,
    statusDotClass,
    statusLabel,
    health,
    openPreview,
    copyLink,
    restartHint,
  };

  return (
    <div className="rs-dev-preview-root">
      <header className="rs-dev-preview-top" role="banner">
        <PreviewBar {...barProps} />
      </header>

      <footer className="rs-dev-preview-bottom" role="contentinfo">
        <PreviewBar {...barProps} />
      </footer>

      <div className="rs-dev-preview-float">
        <button type="button" className="rs-dev-preview-float-btn" onClick={openPreview} title="Open live preview in a new tab">
          <ExternalLink size={15} aria-hidden />
          Open Live Preview
        </button>
      </div>

      <div className="rs-dev-toast" data-visible={toast ? "true" : "false"} role="status">
        {toast}
      </div>
    </div>
  );
}
