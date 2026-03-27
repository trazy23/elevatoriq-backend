const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const storageService = require('./storageService');
const storageServiceMock = require('./storageService-mock');
const path = require('path');

/**
 * Download a file from R2 and extract its text content.
 * Supports: PDF, DOCX, DOC (plain text fallback)
 * Falls back to mock storage if real storage fails
 */
async function extractTextFromStorage(storagePath) {
  let buffer;
  try {
    buffer = await storageService.download(storagePath);
  } catch (err) {
    console.warn(`[Extraction] R2 download failed (${err.message}), using mock storage`);
    buffer = await storageServiceMock.download(storagePath);
  }
  const ext = path.extname(storagePath).toLowerCase();
  return extractTextFromBuffer(buffer, ext, storagePath);
}

/**
 * Extract text directly from a buffer (e.g. freshly uploaded file in memory).
 */
function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)),
  ]);
}

function plainTextFallback(buffer, label) {
  const text = buffer
    .toString('latin1')
    .replace(/[^\x20-\x7E\n\r\t]/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  const usable = text.replace(/\s+/g, '').length;
  if (usable < 50) throw new Error(`Plain-text fallback for ${label} produced no usable content`);
  return `[Plain-text extraction]\n\n${text.slice(0, 60000)}`;
}

// ─── File validation helpers ──────────────────────────────────────────────────

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB hard limit
const MIN_FILE_SIZE_BYTES = 512;               // anything smaller is almost certainly corrupt or empty

/**
 * Magic-byte file type validation.
 * Returns null if valid, or a user-friendly error string if the file is suspect.
 */
function validateFileMagicBytes(buffer, ext, fileName) {
  if (buffer.length > MAX_FILE_SIZE_BYTES) {
    return `File "${fileName}" is too large (${Math.round(buffer.length / 1024 / 1024)} MB). Maximum supported size is 50 MB. Try reducing the file size or splitting it into smaller documents.`;
  }
  if (buffer.length < MIN_FILE_SIZE_BYTES) {
    return `File "${fileName}" appears to be empty or corrupt (${buffer.length} bytes). Please check the file and re-upload.`;
  }

  if (ext === '.pdf') {
    // PDF files must start with %PDF
    const magic = buffer.slice(0, 5).toString('ascii');
    if (!magic.startsWith('%PDF')) {
      return `File "${fileName}" does not appear to be a valid PDF (missing PDF header). If this file was saved with a .pdf extension but is actually a Word document or image, please upload it in its original format.`;
    }
  }

  if (ext === '.docx') {
    // DOCX/XLSX/PPTX are ZIP archives — must start with PK\x03\x04
    const magic = buffer.slice(0, 4);
    if (magic[0] !== 0x50 || magic[1] !== 0x4B || magic[2] !== 0x03 || magic[3] !== 0x04) {
      return `File "${fileName}" does not appear to be a valid Word document. If this is a .doc file (older format), please rename it to .doc before uploading.`;
    }
  }

  return null; // valid
}

/**
 * Detect whether a PDF is password-protected from the error message or buffer.
 */
function isEncryptedPdfError(err) {
  const msg = (err && err.message || '').toLowerCase();
  return msg.includes('encrypt') || msg.includes('password') || msg.includes('decrypt');
}

/**
 * Detect whether extracted PDF text suggests a scanned (image-only) document.
 * Returns true if the page count is meaningful but text is sparse.
 */
function isScannedPdf(data) {
  if (!data) return false;
  const textLen = (data.text || '').replace(/\s+/g, '').length;
  const pages = data.numpages || 1;
  // Fewer than 50 meaningful characters per page is a strong signal of an image-only scan
  return pages >= 1 && textLen < pages * 50;
}

async function extractTextFromBuffer(buffer, ext, fileName = '') {
  // ── File validation (magic bytes, size) ──────────────────────────────────────
  const validationError = validateFileMagicBytes(buffer, ext, fileName);
  if (validationError) {
    throw new Error(validationError);
  }

  // PDF path — with targeted error messages for common failure modes
  if (ext === '.pdf') {
    let pdfData = null;
    try {
      pdfData = await withTimeout(pdfParse(buffer), 20000, 'PDF extraction');

      // Encrypted / password-protected PDF
      if (!pdfData || !pdfData.text) {
        throw new Error('PDF returned no text content');
      }

      // Scanned-only PDF detection
      if (isScannedPdf(pdfData)) {
        const pages = pdfData.numpages || '?';
        console.warn(`[Extraction] Scanned PDF detected: ${fileName} (${pages} pages, sparse text)`);
        throw new Error(
          `This PDF (${fileName}) appears to contain scanned images rather than machine-readable text across ${pages} page(s). ` +
          `ElevatorIQ requires text-searchable PDFs. To resolve: open the PDF in Adobe Acrobat and run "Make Text Searchable" (OCR), ` +
          `or export the source document directly to PDF from Word or your accounting software.`
        );
      }

      const text = pdfData.text
        .replace(/\r\n/g, '\n')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

      if (!text || text.length < 20) {
        throw new Error('PDF appears to be image-based or empty — no extractable text found');
      }

      return `[PDF: ${pdfData.numpages} pages]\n\n${text}`;

    } catch (err) {
      // Password-protected PDF — surface a clear message, don't try fallback
      if (isEncryptedPdfError(err)) {
        throw new Error(
          `File "${fileName}" is password-protected. ElevatorIQ cannot process encrypted PDFs. ` +
          `Please remove the password protection (File → Properties → Security in Adobe Acrobat) and re-upload.`
        );
      }

      // Scanned PDF error already has a good message — re-throw without fallback
      if (err.message && err.message.includes('scanned images')) {
        throw err;
      }

      // Other extraction failures — try plain-text fallback
      console.warn(`[Extraction] PDF extraction failed (${err.message}), trying plain-text fallback`);
      try {
        return plainTextFallback(buffer, fileName);
      } catch (fallbackErr) {
        throw new Error(
          `Could not extract text from "${fileName}". The file may be corrupted or in an unsupported format. ` +
          `Please try re-saving the document as a PDF from its original application and re-uploading.`
        );
      }
    }
  }

  if (ext === '.docx') {
    try {
      return await withTimeout(extractDOCX(buffer), 20000, 'DOCX extraction');
    } catch (err) {
      console.warn(`[Extraction] DOCX extraction failed (${err.message}), trying plain-text fallback`);
      return plainTextFallback(buffer, fileName);
    }
  }

  if (ext === '.doc') {
    return await extractLegacyDOC(buffer, fileName);
  }

  // Unknown extension — try PDF, then plain text
  try {
    return await withTimeout(extractPDF(buffer), 20000, 'PDF extraction (unknown ext)');
  } catch {
    return plainTextFallback(buffer, fileName);
  }
}

async function extractPDF(buffer) {
  const data = await pdfParse(buffer);

  const text = data.text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')        // collapse multiple spaces
    .replace(/\n{3,}/g, '\n\n')     // collapse excessive blank lines
    .trim();

  if (!text || text.length < 20) {
    throw new Error('PDF appears to be image-based or empty — no extractable text found');
  }

  return `[PDF: ${data.numpages} pages]\n\n${text}`;
}

async function extractDOCX(buffer) {
  const result = await mammoth.extractRawText({ buffer });

  if (result.messages && result.messages.length) {
    console.warn('[Extraction] DOCX warnings:', result.messages.map(m => m.message).join('; '));
  }

  const text = result.value
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (!text || text.length < 20) {
    throw new Error('DOCX appears empty — no extractable text found');
  }

  return `[DOCX Document]\n\n${text}`;
}

async function extractLegacyDOC(buffer, fileName = '') {
  // Try mammoth first — it handles many legacy .doc files correctly and
  // produces clean, complete text without binary noise or truncation.
  try {
    const result = await withTimeout(
      mammoth.extractRawText({ buffer }),
      20000,
      'DOC mammoth extraction'
    );
    const text = result.value
      .replace(/\r\n/g, '\n')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    if (text && text.replace(/\s+/g, '').length >= 100) {
      console.log(`[Extraction] DOC mammoth success for ${fileName}: ${text.length} chars`);
      return `[DOC Document]\n\n${text}`;
    }
    console.warn(`[Extraction] DOC mammoth produced sparse output, falling back to plain-text`);
  } catch (err) {
    console.warn(`[Extraction] DOC mammoth failed (${err.message}), falling back to plain-text`);
  }

  // Plain-text fallback: latin-1 decode + strip binary garbage.
  // Use a generous limit — commercial terms often appear late in documents
  // and truncating early causes inaccurate "Not Stated" findings.
  const text = buffer
    .toString('latin1')
    .replace(/[^\x20-\x7E\n\r\t]/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (!text || text.length < 20) {
    throw new Error('DOC appears empty — no extractable text found');
  }

  return `[DOC Legacy Document]\n\n${text.slice(0, 60000)}`;
}

/**
 * Given an array of document rows from the DB, download and extract all text.
 * Returns a single combined string ready to pass to Claude.
 */
async function extractAllDocuments(docRows) {
  const results = await Promise.allSettled(
    docRows.map(async (doc) => {
      const ext = path.extname(doc.file_name).toLowerCase();
      const text = await extractTextFromStorage(doc.storage_path);
      const label = doc.file_type ? `[${doc.file_type.toUpperCase()}]` : '[DOCUMENT]';
      return `${label} ${doc.file_name}\n${'─'.repeat(60)}\n${text}`;
    })
  );

  const parts = results.map((r, i) => {
    if (r.status === 'fulfilled') return r.value;
    const name = docRows[i]?.file_name || 'unknown';
    console.error(`[Extraction] Document ${name} failed:`, r.reason);
    return `[DOCUMENT ${i + 1}: extraction failed — ${r.reason?.message || 'unknown error'}]`;
  });

  return parts.join('\n\n' + '═'.repeat(60) + '\n\n');
}

module.exports = { extractTextFromStorage, extractTextFromBuffer, extractAllDocuments };
