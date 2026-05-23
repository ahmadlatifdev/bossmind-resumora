const fs = require("fs");
const formidableModule = require("formidable");

function getFormidableFactory() {
  if (typeof formidableModule === "function") return formidableModule;
  if (typeof formidableModule.default === "function") return formidableModule.default;
  if (typeof formidableModule.IncomingForm === "function") {
    return (options) => new formidableModule.IncomingForm(options);
  }
  return null;
}

function createUploadForm(options = {}) {
  const factory = getFormidableFactory();
  if (!factory) {
    const err = new Error("formidable_unavailable");
    err.code = "formidable_unavailable";
    throw err;
  }
  return factory(options);
}

async function parseMultipartUpload(req, options = {}) {
  const uploadDir = options.uploadDir;
  if (uploadDir) fs.mkdirSync(uploadDir, { recursive: true });
  const form = createUploadForm({
    uploadDir,
    keepExtensions: true,
    maxFiles: 1,
    maxFileSize: options.maxFileSize || 20 * 1024 * 1024,
    filename: options.filename,
  });

  try {
    const parsed = await form.parse(req);
    if (Array.isArray(parsed) && parsed.length >= 2) {
      return parsed;
    }
    return [parsed?.fields || {}, parsed?.files || parsed || {}];
  } catch (err) {
    throw err;
  }
}

module.exports = {
  createUploadForm,
  parseMultipartUpload,
  formidableErrors: formidableModule.errors,
};
