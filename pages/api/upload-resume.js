import fs from "fs";
import path from "path";
import formidable from "formidable";
import { withObservableApi } from "../../lib/observability/sentry-api";

export const config = {
  api: {
    bodyParser: false,
  },
};

const ALLOWED_MIME = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

async function uploadResumeHandler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!process.env.DEEPSEEK_API_KEY) {
    return res.status(503).json({
      error: "resume_parser_unavailable",
      message: "DEEPSEEK_API_KEY is not configured.",
    });
  }

  const uploadDir = path.join(process.cwd(), "tmp", "uploads");
  fs.mkdirSync(uploadDir, { recursive: true });

  const form = formidable({
    uploadDir,
    keepExtensions: true,
    maxFiles: 1,
    maxFileSize: 10 * 1024 * 1024,
    filename: (_name, _ext, part) => {
      const safeOriginal = (part.originalFilename || "resume")
        .replace(/[^a-zA-Z0-9._-]/g, "-")
        .slice(0, 80);
      return `${Date.now()}-${safeOriginal}`;
    },
  });

  try {
    const [fields, files] = await form.parse(req);
    const uploadedFile = files.resumeFile?.[0];
    if (!uploadedFile) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const mimeType = uploadedFile.mimetype || "";
    if (mimeType && !ALLOWED_MIME.has(mimeType)) {
      return res.status(415).json({
        error: "unsupported_file_type",
        message: "Upload a PDF or Word document (.pdf, .doc, .docx).",
      });
    }

    const buffer = fs.readFileSync(uploadedFile.filepath);
    const { parseBossMindResume } = await import("../../lib/resume-parser");
    const parsed = await parseBossMindResume(buffer, {
      project: process.env.BOSSMIND_PROJECT ?? "resumora",
    });

    return res.status(200).json({
      success: true,
      file: {
        originalName: uploadedFile.originalFilename,
        storedName: path.basename(uploadedFile.filepath),
        size: uploadedFile.size,
        mimeType: mimeType || null,
      },
      resume: parsed.data,
      meta: parsed.meta,
      fields,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed";
    console.error("[upload-resume]", error);
    return res.status(500).json({ error: message });
  }
}

export default withObservableApi(uploadResumeHandler, { route: "/api/upload-resume" });
