const { PARSER_API_ROUTE } = require('../contracts/parserApiContract');

function isParserApiEnabled() {
  const raw = String(process.env.PARSER_API_ENABLED || '').toLowerCase().trim();
  return ['true', '1', 'yes', 'on'].includes(raw);
}

function getParserApiConfig() {
  return {
    enabled: isParserApiEnabled(),
    baseUrl: process.env.PARSER_API_BASE_URL || 'http://localhost:3001',
    timeoutMs: Number(process.env.PARSER_API_TIMEOUT_MS || 30000),
    bearerToken: process.env.PARSER_API_BEARER_TOKEN || null,
  };
}

/**
 * Safe, feature-flagged integration stub for consuming parser API.
 *
 * @param {Buffer|Blob|File} filePayload - PDF file payload
 * @param {string} fileName - source filename
 * @param {Object} [opts]
 * @param {Function} [opts.fetchImpl] - injectable fetch for testing/runtime compatibility
 * @param {FormData} [opts.formDataImpl] - injectable FormData constructor instance
 */
async function parseInvoiceViaBackend(filePayload, fileName, opts = {}) {
  const cfg = getParserApiConfig();

  if (!cfg.enabled) {
    return {
      skipped: true,
      reason: 'PARSER_API_ENABLED is disabled',
    };
  }

  if (!filePayload) {
    throw new Error('parseInvoiceViaBackend requires filePayload');
  }

  if (!fileName) {
    throw new Error('parseInvoiceViaBackend requires fileName');
  }

  const fetchImpl = opts.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new Error('No fetch implementation available');
  }

  const formData = opts.formDataImpl || new FormData();
  const normalizedPayload = Buffer.isBuffer(filePayload)
    ? new Blob([filePayload], { type: 'application/pdf' })
    : filePayload;
  formData.append('file', normalizedPayload, fileName);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), cfg.timeoutMs);

  const url = `${cfg.baseUrl}${PARSER_API_ROUTE}`;
  const headers = {};
  if (cfg.bearerToken) headers.Authorization = `Bearer ${cfg.bearerToken}`;

  try {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers,
      body: formData,
      signal: controller.signal,
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      const normalizedError = payload?.error && typeof payload.error === 'object'
        ? payload.error
        : { message: payload?.error };
      const message = normalizedError?.message || `Parser API request failed (${response.status})`;
      const err = new Error(message);
      err.status = normalizedError?.http_status || response.status;
      err.code = normalizedError?.code || 'PARSER_API_REQUEST_FAILED';
      err.retryable = Boolean(normalizedError?.retryable);
      err.payload = payload;
      throw err;
    }

    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  getParserApiConfig,
  isParserApiEnabled,
  parseInvoiceViaBackend,
};
