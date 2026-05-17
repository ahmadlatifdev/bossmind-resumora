import Link from "next/link";
import { ArrowRight, Lock, Upload } from "lucide-react";
import { useId, useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { translations } from "@/lib/marketing/site-copy";

export default function UploadPanel({ sectionId = "intake" }) {
  const { lang } = useLanguage();
  const t = translations[lang];
  const [uploadStatus, setUploadStatus] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState("");
  const uploadFieldId = useId();

  const submitFile = async (file) => {
    if (!file) {
      setUploadStatus(t.uploadError);
      return;
    }
    setUploadStatus("");
    try {
      const data = new FormData();
      data.append("resumeFile", file);
      const response = await fetch("/api/upload-resume", { method: "POST", body: data });
      if (!response.ok) throw new Error("Upload failed");
      setUploadStatus(t.uploadSuccess);
      setFileName("");
    } catch {
      setUploadStatus(t.uploadError);
    }
  };

  const handleUpload = async (event) => {
    event.preventDefault();
    const file = event.currentTarget.elements.resumeFile?.files?.[0];
    await submitFile(file);
    if (uploadStatus !== t.uploadError) event.currentTarget.reset();
  };

  const onDrop = async (event) => {
    event.preventDefault();
    setDragOver(false);
    const file = event.dataTransfer?.files?.[0];
    if (file) {
      setFileName(file.name);
      await submitFile(file);
    }
  };

  return (
    <section id={sectionId} className="rs-section rs-upload-section">
      <div className="rs-container">
        <p className="rs-eyebrow">{t.uploadEyebrow}</p>
        <h2 className="rs-h2 rs-upload-title">{t.uploadTitle}</h2>
        <p className="rs-subtitle rs-upload-subtitle">{t.uploadText}</p>

        <div className="rs-upload-panel rs-upload-panel--lux">
          <form onSubmit={handleUpload} className="rs-upload-form">
            <label
              htmlFor={uploadFieldId}
              className={`rs-upload-dropzone${dragOver ? " rs-upload-dropzone--active" : ""}${fileName ? " rs-upload-dropzone--has-file" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
            >
              <Upload className="rs-upload-dropzone-icon" size={28} strokeWidth={1.5} aria-hidden />
              <span className="rs-upload-dropzone-title">{t.uploadDropTitle}</span>
              <span className="rs-upload-dropzone-hint">{t.uploadDropHint}</span>
              {fileName ? <span className="rs-upload-file-name">{fileName}</span> : null}
              <input
                id={uploadFieldId}
                className="rs-upload-file-input"
                type="file"
                name="resumeFile"
                accept=".pdf,.doc,.docx,application/pdf"
                required
                onChange={(e) => setFileName(e.target.files?.[0]?.name || "")}
              />
            </label>
            <button type="submit" className="rs-btn-accent rs-upload-submit">
              {t.uploadButton}
            </button>
            {uploadStatus ? (
              <p
                className="rs-upload-status"
                data-state={uploadStatus === t.uploadSuccess ? "ok" : "err"}
                role="status"
              >
                {uploadStatus}
              </p>
            ) : null}
          </form>

          <aside className="rs-upload-aside">
            <p className="rs-upload-confidential">
              <Lock size={16} strokeWidth={1.75} aria-hidden />
              {t.uploadConfidentialLine}
            </p>
            <p className="rs-upload-hint-text">{t.uploadHint}</p>
            <Link href="/register" className="rs-card-cta">
              {t.navRegister}
              <ArrowRight size={14} aria-hidden />
            </Link>
          </aside>
        </div>
      </div>
    </section>
  );
}
