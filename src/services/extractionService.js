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

async function extractTextFromBuffer(buffer, ext, fileName = '') {
  // PDF path — with silent fallback for cupsfilter/low-fidelity PDFs
  if (ext === '.pdf') {
    try {
      const result = await withTimeout(extractPDF(buffer), 20000, 'PDF extraction');
      const usable = result.replace(/\s+/g, '').length;
      if (usable >= 100) return result;
      console.warn(`[Extraction] PDF text too sparse (${usable} chars), trying plain-text fallback`);
    } catch (err) {
      console.warn(`[Extraction] PDF extraction failed (${err.message}), trying plain-text fallback`);
    }
    return plainTextFallback(buffer, fileName);
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
