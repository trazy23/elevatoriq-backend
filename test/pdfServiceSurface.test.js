const test = require('node:test');
const assert = require('node:assert/strict');
const { wrapInHTML } = require('../src/services/pdfService');

test('wrapInHTML renders report shell and section text', async () => {
  const html = await wrapInHTML(
    'SECTION 1 — EXECUTIVE SUMMARY\n[HIGH] Hidden fee\nFinding: fee in exclusions',
    'invoice_review',
    'https://elevatoriq.ai/api/reports/download/test-token'
  );

  assert.match(html, /ElevatorIQ/);
  assert.match(html, /Independent Analysis Report/);
  assert.match(html, /EXECUTIVE SUMMARY/);
  assert.match(html, /risk-high/);
});
