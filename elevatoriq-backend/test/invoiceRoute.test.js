const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const { createInvoiceRouter } = require('../src/routes/invoice');

async function withServer(router, run) {
  const app = express();
  app.use('/api/invoice', router);

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();

  const request = (path, init) => fetch(`http://127.0.0.1:${port}${path}`, init);

  try {
    await run(request);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function pdfForm(filename = 'invoice.pdf', content = '%PDF-1.4 fake') {
  const form = new FormData();
  const blob = new Blob([content], { type: 'application/pdf' });
  form.append('file', blob, filename);
  return form;
}

test('POST /api/invoice/parse returns 400 when no file is provided', async () => {
  const router = createInvoiceRouter({
    extractTextFromBuffer: async () => 'unused',
    parseInvoiceText: () => ({}),
    mapNormalizedOutput: () => ({}),
    buildConfidenceMetadata: () => ({}),
    validateParsedInvoiceData: () => true,
    validateParseInvoiceResponse: () => true,
    validateParserErrorResponse: () => true,
  });

  await withServer(router, async (request) => {
    const res = await request('/api/invoice/parse', { method: 'POST' });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.equal(body.error.code, 'MISSING_FILE');
    assert.equal(body.error.http_status, 400);
  });
});

test('POST /api/invoice/parse returns 400 for unsupported file type', async () => {
  const router = createInvoiceRouter({
    extractTextFromBuffer: async () => 'unused',
    parseInvoiceText: () => ({}),
    mapNormalizedOutput: () => ({}),
    buildConfidenceMetadata: () => ({}),
    validateParsedInvoiceData: () => true,
    validateParseInvoiceResponse: () => true,
    validateParserErrorResponse: () => true,
  });

  await withServer(router, async (request) => {
    const form = new FormData();
    form.append('file', new Blob(['hello'], { type: 'text/plain' }), 'invoice.txt');

    const res = await request('/api/invoice/parse', { method: 'POST', body: form });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.equal(body.error.code, 'UNSUPPORTED_OR_INVALID_UPLOAD');
    assert.match(body.error.message, /Unsupported file type/i);
  });
});

test('POST /api/invoice/parse returns 422 for extraction failure marker', async () => {
  const router = createInvoiceRouter({
    extractTextFromBuffer: async () => '[EXTRACTION FAILED: invoice.pdf — corrupted]',
    parseInvoiceText: () => ({}),
    mapNormalizedOutput: () => ({}),
    buildConfidenceMetadata: () => ({}),
    validateParsedInvoiceData: () => true,
    validateParseInvoiceResponse: () => true,
    validateParserErrorResponse: () => true,
  });

  await withServer(router, async (request) => {
    const res = await request('/api/invoice/parse', { method: 'POST', body: pdfForm() });
    assert.equal(res.status, 422);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.equal(body.error.code, 'UNREADABLE_DOCUMENT');
    assert.equal(body.error.retryable, false);
  });
});

test('POST /api/invoice/parse returns 200 with normalized + confidence payload', async () => {
  const parsed = {
    vendor: 'Acme Elevator',
    elevator_brand: 'OTIS',
    elevator_model: 'Gen2',
    line_items: [{ description: 'PM Visit', quantity: 1, unit_price: 200, total: 200 }],
    totals: { subtotal: 200, tax: 12, total: 212 },
  };

  const router = createInvoiceRouter({
    extractTextFromBuffer: async () => 'Invoice text',
    parseInvoiceText: () => parsed,
    mapNormalizedOutput: () => ({
      supplier_name: 'Acme Elevator',
      oem_brand: 'OTIS',
      oem_model: 'Gen2',
      currency: 'USD',
      totals: { subtotal_amount: 200, tax_amount: 12, invoice_total_amount: 212 },
      line_items: [{ index: 0, title: 'PM Visit', quantity: 1, unit_amount: 200, line_total: 200, category_hint: 'labor' }],
      bid_analysis: { inferred_service_scope: ['PM Visit'], inferred_vendor_slug: 'acme_elevator' },
    }),
    buildConfidenceMetadata: () => ({
      overall: 'high',
      overall_score: 0.91,
      fields: {
        vendor: 0.9,
        elevator_brand: 0.9,
        elevator_model: 0.8,
        totals_subtotal: 0.95,
        totals_tax: 0.85,
        totals_total: 0.95,
        line_items_count: 0.8,
      },
      methodology: 'heuristic_v1',
    }),
    validateParsedInvoiceData: () => true,
    validateParseInvoiceResponse: () => true,
    validateParserErrorResponse: () => true,
  });

  await withServer(router, async (request) => {
    const res = await request('/api/invoice/parse', { method: 'POST', body: pdfForm() });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.file_name, 'invoice.pdf');
    assert.equal(body.data.vendor, 'Acme Elevator');
    assert.equal(body.normalized.currency, 'USD');
    assert.equal(body.confidence.overall, 'high');
  });
});

test('POST /api/invoice/parse returns 500 semantic error when response schema invalid', async () => {
  const router = createInvoiceRouter({
    extractTextFromBuffer: async () => 'Invoice text',
    parseInvoiceText: () => ({
      vendor: 'Acme Elevator',
      elevator_brand: 'OTIS',
      elevator_model: 'Gen2',
      line_items: [{ description: 'PM Visit', quantity: 1, unit_price: 200, total: 200 }],
      totals: { subtotal: 200, tax: 12, total: 212 },
    }),
    mapNormalizedOutput: () => ({ invalid: true }),
    buildConfidenceMetadata: () => ({ overall: 'high' }),
    validateParsedInvoiceData: () => true,
    validateParseInvoiceResponse: () => false,
    validateParserErrorResponse: () => true,
  });

  await withServer(router, async (request) => {
    const res = await request('/api/invoice/parse', { method: 'POST', body: pdfForm() });
    assert.equal(res.status, 500);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.equal(body.error.code, 'PARSE_RESPONSE_SCHEMA_INVALID');
    assert.equal(body.error.retryable, true);
  });
});