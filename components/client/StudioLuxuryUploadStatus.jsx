import { uploadStateLabel } from "@/lib/client/studio-upload-i18n";

const L = (lang, en, fr) => (lang === "fr" ? fr : en);

export default function StudioLuxuryUploadStatus({
  lang = "en",
  state = "idle",
  percent = 0,
  errorMessage = "",
  etaSeconds = null,
  speedKbps = null,
  onRetry,
  pendingFile = null,
}) {
  if (state === "idle" && !errorMessage) return null;

  const label = uploadStateLabel(state, lang);
  const showBar = ["uploading", "retrying", "scanning", "syncing", "validating"].includes(state);
  const failed = state === "failed";
  const success = state === "success";

  return (
    <div
      className={`rs-studio-upload-status${success ? " is-success" : ""}${failed ? " is-error" : ""}${showBar ? " is-active" : ""}`}
      role="status"
      aria-live="polite"
    >
      <div className="rs-studio-upload-status__head">
        <span className="rs-studio-upload-status__label">{label}</span>
        {showBar ? <span className="rs-studio-upload-status__pct">{percent}%</span> : null}
        {success ? <span className="rs-studio-upload-status__badge" aria-hidden>✦</span> : null}
      </div>

      {showBar ? (
        <div className="rs-studio-upload-status__bar" aria-hidden>
          <div className="rs-studio-upload-status__fill" style={{ width: `${Math.max(4, percent)}%` }} />
        </div>
      ) : null}

      {showBar && (speedKbps || etaSeconds != null) ? (
        <p className="rs-studio-upload-status__meta">
          {speedKbps
            ? L(lang, `Speed ~${speedKbps} KB/s`, `Debit ~${speedKbps} Ko/s`)
            : null}
          {etaSeconds != null && etaSeconds > 0
            ? L(lang, ` · ~${etaSeconds}s remaining`, ` · ~${etaSeconds}s restants`)
            : null}
        </p>
      ) : null}

      {failed && errorMessage ? (
        <div className="rs-studio-upload-status__error-card">
          <p>{errorMessage}</p>
          {onRetry && pendingFile ? (
            <button type="button" className="rs-btn-accent rs-studio-upload-status__retry" onClick={onRetry}>
              {L(lang, "Retry upload", "Reessayer")}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
