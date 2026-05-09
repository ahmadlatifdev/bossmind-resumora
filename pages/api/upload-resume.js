import fs from "fs";
import path from "path";
import formidable from "formidable";

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
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
    return res.status(200).json({
      success: true,
      file: {
        originalName: uploadedFile.originalFilename,
        storedName: path.basename(uploadedFile.filepath),
        size: uploadedFile.size,
      },
      fields,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Upload failed" });
  }
}
