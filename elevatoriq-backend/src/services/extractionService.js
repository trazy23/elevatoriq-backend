const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const storageService = require('./storageService');
const path = require('path');

/**
 * Download a file from R2 and extract its text content.
 * Supports: PDF, DOCX, DOC (plain text fallback)
 */
async function extractTextFromStorage(storagePath) {
  const buffer = await storageService.download(storagePath);
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

async function extractTextFromBuffer(buffer, ext, fileName = '') {
  try {
    if (ext === '.pdf') {
      return await withTimeout(extractPDF(buffer), 20000, 'PDF extraction');
    }
    if (ext === '.docx') {
      return await withTimeout(extractDOCX(buffer), 20000, 'DOCX extraction');
    }
    if (ext === '.doc') {
      return extractLegacyDOC(buffer);
    }
    // Unknown extension — try PDF first, then plain text
    try {
      return await extractPDF(buffer);
    } catch {
      return buffer.toString('utf8').replace(/[^\x20-\x7E\n\r\t]/g, ' ').trim();
    }
  } catch (err) {
    console.error(`[Extraction] Failed for ${fileName}:`, err.message);
    return `[EXTRACTION FAILED: ${fileName} — ${err.message}]`;
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

function extractLegacyDOC(buffer) {
  // Legacy .doc (CFB) can hang/perform poorly in DOCX parsers.
  // Use a resilient plain-text fallback so pipeline can continue.
  const text = buffer
    .toString('latin1')
    .replace(/[^\x20-\x7E\n\r\t]/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (!text || text.length < 20) {
    throw new Error('DOC appears empty — no extractable text found');
  }

  // Keep prompt payload bounded for reliable model latency.
  return `[DOC Legacy Document]\n\n${text.slice(0, 12000)}`;
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
