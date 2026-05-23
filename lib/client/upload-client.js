import { mapApiErrorToMessage, uploadErrorMessage, uploadStateLabel } from "@/lib/client/studio-upload-i18n";

const DEFAULT_RETRIES = 3;
const RETRY_DELAY_MS = 1200;

export async function parseApiJson(res) {
  const text = typeof res.text === "function" ? await res.text() : String(res.text || "");
  if (!text) return { ok: res.ok, error: res.ok ? undefined : "empty_response" };
  try {
    return JSON.parse(text);
  } catch {
    const snippet = text.slice(0, 80).replace(/\s+/g, " ");
    if (/internal server error/i.test(text)) {
      return { ok: false, error: "internal_error", message: snippet };
    }
    return { ok: false, error: "invalid_response", message: snippet };
  }
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Upload with XMLHttpRequest progress + automatic retries.
 */
export function uploadClientDocument({
  file,
  planId,
  docType = "supporting_file",
  lang = "en",
  method = "POST",
  docId = null,
  onStateChange,
  onProgress,
  maxRetries = DEFAULT_RETRIES,
}) {
  return new Promise((resolve, reject) => {
    let attempt = 0;

    const run = () => {
      attempt += 1;
      onStateChange?.(attempt > 1 ? "retrying" : "uploading", { attempt, maxRetries });

      const xhr = new XMLHttpRequest();
      const url =
        method === "PUT" && docId
          ? `/api/client/documents?id=${encodeURIComponent(docId)}`
          : "/api/client/documents";

      xhr.open(method, url, true);
      xhr.withCredentials = true;
      xhr.setRequestHeader("Accept", "application/json");
      xhr.setRequestHeader("X-Resumora-Lang", lang);

      xhr.upload.onprogress = (ev) => {
        if (!ev.lengthComputable) return;
        const pct = Math.min(100, Math.round((ev.loaded / ev.total) * 100));
        onProgress?.({ loaded: ev.loaded, total: ev.total, percent: pct });
      };

      xhr.onload = async () => {
        const data = await parseApiJson({
          ok: xhr.status >= 200 && xhr.status < 300,
          status: xhr.status,
          text: xhr.responseText,
        });
        if (res.ok && data.ok !== false) {
          onStateChange?.("success", { attempt });
          resolve({ data, status: xhr.status });
          return;
        }
        const err = new Error(mapApiErrorToMessage(data, lang));
        err.code = data.error;
        err.status = xhr.status;
        err.data = data;
        if (attempt < maxRetries && xhr.status >= 500) {
          onStateChange?.("retrying", { attempt, maxRetries });
          await delay(RETRY_DELAY_MS * attempt);
          run();
          return;
        }
        onStateChange?.("failed", { attempt, code: data.error });
        reject(err);
      };

      xhr.onerror = async () => {
        if (attempt < maxRetries) {
          onStateChange?.("retrying", { attempt, maxRetries });
          await delay(RETRY_DELAY_MS * attempt);
          run();
          return;
        }
        onStateChange?.("failed", { attempt });
        reject(new Error(mapApiErrorToMessage({ error: "upload_failed" }, lang)));
      };

      xhr.ontimeout = async () => {
        if (attempt < maxRetries) {
          onStateChange?.("retrying", { attempt, maxRetries });
          await delay(RETRY_DELAY_MS * attempt);
          run();
          return;
        }
        onStateChange?.("failed", { attempt });
        reject(new Error(mapApiErrorToMessage({ error: "upload_failed" }, lang)));
      };

      xhr.timeout = 120000;
      const fd = new FormData();
      fd.append("file", file);
      fd.append("planId", planId);
      if (docType) fd.append("docType", docType);
      fd.append("lang", lang);
      xhr.send(fd);
    };

    run();
  });
}

export function validateClientFile(file, lang = "en") {
  const ext = (file?.name || "").toLowerCase().match(/\.[a-z0-9]+$/)?.[0] || "";
  const allowed = [".pdf", ".doc", ".docx"];
  if (!allowed.includes(ext)) {
    return { ok: false, code: "invalid_format", message: mapApiErrorToMessage({ error: "invalid_format" }, lang) };
  }
  const max = 20 * 1024 * 1024;
  if (file.size > max) {
    return { ok: false, code: "file_too_large", message: mapApiErrorToMessage({ error: "file_too_large" }, lang) };
  }
  return { ok: true };
}
