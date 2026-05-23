const crypto = require("crypto");
const fs = require("fs");

const MAX_BYTES = Number(process.env.CLIENT_UPLOAD_MAX_BYTES || 20 * 1024 * 1024);
const ALLOWED_EXT = new Set([".pdf", ".doc", ".docx"]);
const ALLOWED_MIME = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/octet-stream",
]);

const BLOCKED_EXT = new Set([
  ".exe",
  ".bat",
  ".cmd",
  ".sh",
  ".js",
  ".msi",
  ".dll",
  ".zip",
  ".rar",
  ".html",
  ".htm",
]);

function extOf(name = "") {
  const n = String(name).toLowerCase();
  const i = n.lastIndexOf(".");
  return i >= 0 ? n.slice(i) : "";
}

function sniffMagic(filePath) {
  try {
    const fd = fs.openSync(filePath, "r");
    const buf = Buffer.alloc(8);
    fs.readSync(fd, buf, 0, 8, 0);
    fs.closeSync(fd);
    if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) return "pdf";
    if (buf[0] === 0xd0 && buf[1] === 0xcf && buf[2] === 0x11 && buf[3] === 0xe0) return "doc";
    if (buf[0] === 0x50 && buf[1] === 0x4b) return "docx";
    return "unknown";
  } catch {
    return "unknown";
  }
}

function validateUploadFile({ originalFilename = "", mimetype = "", size = 0, filePath = "" } = {}) {
  const ext = extOf(originalFilename);
  if (!ext || !ALLOWED_EXT.has(ext)) {
    return { ok: false, code: "invalid_format", error: "invalid_format" };
  }
  if (BLOCKED_EXT.has(ext)) {
    return { ok: false, code: "blocked_format", error: "blocked_format" };
  }
  if (Number(size) > MAX_BYTES) {
    return { ok: false, code: "file_too_large", error: "file_too_large", maxBytes: MAX_BYTES };
  }
  if (mimetype && !ALLOWED_MIME.has(String(mimetype).toLowerCase())) {
    return { ok: false, code: "invalid_mime", error: "invalid_mime" };
  }
  if (filePath) {
    const magic = sniffMagic(filePath);
    if (magic === "unknown") {
      return { ok: false, code: "corrupt_file", error: "corrupt_file" };
    }
    if (ext === ".pdf" && magic !== "pdf") return { ok: false, code: "corrupt_file", error: "corrupt_file" };
    if (ext === ".doc" && magic !== "doc") return { ok: false, code: "corrupt_file", error: "corrupt_file" };
    if (ext === ".docx" && magic !== "docx") return { ok: false, code: "corrupt_file", error: "corrupt_file" };
  }
  return { ok: true };
}

function sha256File(filePath) {
  try {
    const hash = crypto.createHash("sha256");
    hash.update(fs.readFileSync(filePath));
    return hash.digest("hex");
  } catch {
    return "";
  }
}

module.exports = {
  MAX_BYTES,
  validateUploadFile,
  sha256File,
  extOf,
};
