import { useId, useState } from "react";
import { Upload } from "lucide-react";

const COPY = {
  en: {
    title: "Drop your document here",
    hint: "or click to browse · PDF, DOC, DOCX",
    uploading: "Uploading…",
  },
  fr: {
    title: "Deposez votre document ici",
    hint: "ou cliquez pour parcourir · PDF, DOC, DOCX",
    uploading: "Televersement…",
  },
};

/** Luxury drag/drop file picker — hidden native input, styled dropzone. */
export default function StudioFileDropzone({
  lang = "en",
  disabled = false,
  busy = false,
  onFile,
  inputDataAttr,
  accept = ".pdf,.doc,.docx,application/pdf",
}) {
  const t = COPY[lang === "fr" ? "fr" : "en"] || COPY.en;
  const fieldId = useId();
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState("");

  async function handleFile(file) {
    if (!file || disabled || busy) return;
    setFileName(file.name);
    await onFile?.(file);
  }

  return (
    <label
      htmlFor={fieldId}
      className={`rs-studio-dropzone${dragOver ? " rs-studio-dropzone--active" : ""}${fileName ? " rs-studio-dropzone--has-file" : ""}${busy ? " rs-studio-dropzone--busy" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled && !busy) setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (disabled || busy) return;
        handleFile(e.dataTransfer?.files?.[0]);
      }}
    >
      <Upload className="rs-studio-dropzone-icon" size={26} strokeWidth={1.5} aria-hidden />
      <span className="rs-studio-dropzone-title">{busy ? t.uploading : t.title}</span>
      <span className="rs-studio-dropzone-hint">{t.hint}</span>
      {fileName ? <span className="rs-studio-dropzone-file">{fileName}</span> : null}
      <input
        id={fieldId}
        type="file"
        className="rs-studio-file-input"
        accept={accept}
        disabled={disabled || busy}
        data-rs-studio-upload-input={inputDataAttr || undefined}
        onChange={(e) => {
          const f = e.target.files?.[0];
          handleFile(f);
          e.target.value = "";
        }}
      />
    </label>
  );
}
