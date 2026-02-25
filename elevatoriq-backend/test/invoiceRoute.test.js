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
    validateParsedInvoiceData: () => true,
    validateParseInvoiceResponse: () => true,
  });

  await withServer(router, async (request) => {
    const res = await request('/api/invoice/parse', { method: 'POST' });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /No PDF file provided/i);
  });
});

test('POST /api/invoice/parse returns 400 for unsupported file type', async () => {
  const router = createInvoiceRouter({
    extractTextFromBuffer: async () => 'unused',
    parseInvoiceText: () => ({}),
    validateParsedInvoiceData: () => true,
    validateParseInvoiceResponse: () => true,
  });

  await withServer(router, async (request) => {
    const form = new FormData();
    form.append('file', new Blob(['hello'], { type: 'text/plain' }), 'invoice.txt');

    const res = await request('/api/invoice/parse', { method: 'POST', body: form });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /Unsupported file type/i);
  });
});

test('POST /api/invoice/parse returns 422 for extraction failure marker', async () => {
  const router = createInvoiceRouter({
    extractTextFromBuffer: async () => '[EXTRACTION FAILED: invoice.pdf — corrupted]',
    parseInvoiceText: () => ({}),
    validateParsedInvoiceData: () => true,
    validateParseInvoiceResponse: () => true,
  });

  await withServer(router, async (request) => {
    const res = await request('/api/invoice/parse', { method: 'POST', body: pdfForm() });
    assert.equal(res.status, 422);
    const body = await res.json();
    assert.match(body.error, /image-based|extractable text/i);
  });
});

test('POST /api/invoice/parse returns 200 with valid structured payload', async () => {
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
    validateParsedInvoiceData: () => true,
    validateParseInvoiceResponse: () => true,
  });

  await withServer(router, async (request) => {
    const res = await request('/api/invoice/parse', { method: 'POST', body: pdfForm() });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.file_name, 'invoice.pdf');
    assert.equal(body.data.vendor, 'Acme Elevator');
  });
});
