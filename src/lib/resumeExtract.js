/**
 * Client-side resume text extraction.
 * Supported: .txt /.md /.csv, .docx (mammoth), .pdf (pdf.js).
 * Legacy .doc (application/msword) is not supported in-browser — returns a clear error.
 */

export const UNSUPPORTED_FILE_MESSAGE =
  'Unsupported file type. Please upload a .pdf or .docx file.';

export class ResumeExtractError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ResumeExtractError';
  }
}

function extensionOf(file) {
  const name = String(file?.name || '').toLowerCase();
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot) : '';
}

function mimeOf(file) {
  return String(file?.type || '').toLowerCase();
}

export function isLegacyDoc(file) {
  const ext = extensionOf(file);
  const mime = mimeOf(file);
  return ext === '.doc' || mime === 'application/msword' || mime === 'application/x-msword';
}

export function isDocx(file) {
  const ext = extensionOf(file);
  const mime = mimeOf(file);
  return (
    ext === '.docx' ||
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  );
}

export function isPdf(file) {
  const ext = extensionOf(file);
  const mime = mimeOf(file);
  return ext === '.pdf' || mime === 'application/pdf';
}

export function isPlainText(file) {
  const ext = extensionOf(file);
  const mime = mimeOf(file);
  return ['.txt', '.md', '.csv'].includes(ext) || mime.startsWith('text/');
}

async function extractPdfText(arrayBuffer) {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
  ).toString();
  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
  const parts = [];
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const line = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .filter(Boolean)
      .join(' ');
    if (line.trim()) parts.push(line.trim());
  }
  return parts.join('\n').trim();
}

async function extractDocxText(arrayBuffer) {
  const mammoth = (await import('mammoth')).default;
  const result = await mammoth.extractRawText({ arrayBuffer });
  return String(result?.value || '').trim();
}

/**
 * @param {File} file
 * @returns {Promise<string>} raw extracted text
 * @throws {ResumeExtractError}
 */
export async function extractResumeText(file) {
  if (!file) {
    throw new ResumeExtractError(UNSUPPORTED_FILE_MESSAGE);
  }

  if (isLegacyDoc(file)) {
    throw new ResumeExtractError(UNSUPPORTED_FILE_MESSAGE);
  }

  if (isPlainText(file)) {
    const text = String(await file.text()).trim();
    if (!text) {
      throw new ResumeExtractError(
        'The uploaded file is empty. Please upload a .pdf or .docx with resume content.'
      );
    }
    return text;
  }

  if (isDocx(file)) {
    try {
      const text = await extractDocxText(await file.arrayBuffer());
      if (!text) {
        throw new ResumeExtractError(
          'Could not read text from this .docx. Please try another file or a .pdf.'
        );
      }
      return text;
    } catch (err) {
      if (err instanceof ResumeExtractError) throw err;
      throw new ResumeExtractError(
        'Could not read this .docx file. Please upload a .pdf or .docx file.'
      );
    }
  }

  if (isPdf(file)) {
    try {
      const text = await extractPdfText(await file.arrayBuffer());
      if (!text) {
        throw new ResumeExtractError(
          'Could not read text from this .pdf (it may be a scanned image). Please upload a text-based .pdf or .docx.'
        );
      }
      return text;
    } catch (err) {
      if (err instanceof ResumeExtractError) throw err;
      throw new ResumeExtractError(
        'Could not read this .pdf file. Please upload a .pdf or .docx file.'
      );
    }
  }

  throw new ResumeExtractError(UNSUPPORTED_FILE_MESSAGE);
}
