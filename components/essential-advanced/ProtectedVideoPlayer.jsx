import { useCallback, useEffect, useRef, useState } from "react";
import { translations } from "@/lib/marketing/site-copy";

export default function ProtectedVideoPlayer({ videoId, lang, title }) {
  const t = translations[lang] || translations.en;
  const [phase, setPhase] = useState("loading");
  const [embedUrl, setEmbedUrl] = useState("");
  const [usedFallback, setUsedFallback] = useState(false);
  const reportedReady = useRef(false);

  const report = useCallback(
    async (event, detail = "") => {
      try {
        await fetch("/api/essential-advanced/video-event", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ event, videoId, lang, detail }),
        });
      } catch {
        /* monitoring best-effort */
      }
    },
    [videoId, lang]
  );

  const loadDelivery = useCallback(
    async (useFallback = false) => {
      setPhase("loading");
      await report("video_load_start");
      try {
        const res = await fetch(
          `/api/essential-advanced/video?videoId=${encodeURIComponent(videoId)}&lang=${lang}`,
          { credentials: "same-origin" }
        );
        const data = await res.json();
        if (!res.ok) {
          setPhase("error");
          await report("video_load_error", data.error || String(res.status));
          return;
        }
        const url = useFallback && data.fallbackEmbedUrl ? data.fallbackEmbedUrl : data.embedUrl;
        if (!url) {
          setPhase("error");
          await report("video_load_error", "no_embed_url");
          return;
        }
        setEmbedUrl(url);
        setUsedFallback(useFallback);
        setPhase("ready");
        await report(useFallback ? "video_fallback" : "video_load_ok");
      } catch {
        setPhase("error");
        await report("video_load_error", "network");
      }
    },
    [videoId, lang, report]
  );

  useEffect(() => {
    reportedReady.current = false;
    loadDelivery(false);
  }, [loadDelivery]);

  async function retryWithFallback() {
    await loadDelivery(true);
  }

  function onIframeLoad() {
    if (reportedReady.current) return;
    reportedReady.current = true;
    report("video_playback_ready");
  }

  return (
    <div className="rs-ea-video-player" data-rs-ea-video={videoId} data-rs-ea-video-lang={lang}>
      {phase === "loading" && (
        <div className="rs-ea-video-player-state rs-ea-video-player-state--loading">
          <span className="rs-ea-video-spinner" aria-hidden="true" />
          <p>{t.eaVideoLoading}</p>
        </div>
      )}

      {phase === "error" && (
        <div className="rs-ea-video-player-state rs-ea-video-player-state--error">
          <p>{t.eaVideoError}</p>
          <div className="rs-ea-video-player-actions">
            <button type="button" className="rs-btn-ghost" onClick={() => loadDelivery(false)}>
              {t.eaStudioRetry}
            </button>
            <button type="button" className="rs-btn-accent" onClick={retryWithFallback}>
              {t.eaVideoFallback}
            </button>
          </div>
        </div>
      )}

      {phase === "ready" && embedUrl && (
        <>
          {usedFallback && (
            <p className="rs-ea-video-fallback-note" role="status">
              {t.eaVideoFallbackActive}
            </p>
          )}
          <div className="rs-ea-video-embed">
            <iframe
              title={title}
              src={embedUrl}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              loading="lazy"
              onLoad={onIframeLoad}
            />
          </div>
        </>
      )}
    </div>
  );
}
