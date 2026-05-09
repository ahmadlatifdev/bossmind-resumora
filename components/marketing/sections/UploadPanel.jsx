import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useId, useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { translations } from "@/lib/marketing/site-copy";

export default function UploadPanel() {
  const { lang } = useLanguage();
  const t = translations[lang];
  const [uploadStatus, setUploadStatus] = useState("");
  const uploadFieldId = useId();

  const handleUpload = async (event) => {
    event.preventDefault();
    setUploadStatus("");
    const fileInput = event.currentTarget.elements.resumeFile;
    const file = fileInput?.files?.[0];
    if (!file) {
      setUploadStatus(t.uploadError);
      return;
    }
    try {
      const data = new FormData();
      data.append("resumeFile", file);
      const response = await fetch("/api/upload-resume", {
        method: "POST",
        body: data,
      });
      if (!response.ok) throw new Error("Upload failed");
      setUploadStatus(t.uploadSuccess);
      event.currentTarget.reset();
    } catch {
      setUploadStatus(t.uploadError);
    }
  };

  return (
    <section id="intake" className="rs-section rs-section-muted">
      <div className="rs-container">
        <p className="rs-eyebrow">{t.footerUpload}</p>
        <h2 className="rs-h2">{t.uploadTitle}</h2>
        <p className="rs-subtitle">{t.uploadText}</p>
        <div className="rs-upload-panel">
          <form onSubmit={handleUpload} style={{ display: "grid", gap: "0.75rem" }}>
            <label htmlFor={uploadFieldId} className="sr-only">
              Resume file
            </label>
            <input id={uploadFieldId} className="rs-file-input" type="file" name="resumeFile" accept=".pdf,.doc,.docx,application/pdf" required />
            <button type="submit" className="rs-btn-accent" style={{ justifySelf: "start" }}>
              {t.uploadButton}
            </button>
            {uploadStatus ? (
              <p className="rs-upload-status" data-state={uploadStatus === t.uploadSuccess ? "ok" : "err"} role="status">
                {uploadStatus}
              </p>
            ) : null}
          </form>
          <div>
            <p style={{ margin: 0, fontSize: "0.9375rem", lineHeight: 1.7, color: "var(--rs-text-secondary)" }}>{t.uploadHint}</p>
            <Link href="/register" className="rs-card-cta" style={{ marginTop: "1rem" }}>
              {t.navRegister}
              <ArrowRight size={14} aria-hidden />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
