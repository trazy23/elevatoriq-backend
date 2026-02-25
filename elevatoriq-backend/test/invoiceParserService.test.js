const test = require('node:test');
const assert = require('node:assert/strict');
const { parseInvoiceText } = require('../src/services/invoiceParserService');

test('parseInvoiceText extracts vendor, line items, totals, and elevator details', () => {
  const input = `
    Vendor: ACME Elevator Services, LLC
    Invoice # 93432
    Brand: Otis
    Model: Gen2 MRL

    2 Door Roller Assemblies $125.00 $250.00
    Controller diagnostics labor $300.00

    Subtotal $550.00
    Tax $33.00
    Total Due $583.00
  `;

  const parsed = parseInvoiceText(input);

  assert.equal(parsed.vendor, 'ACME Elevator Services, LLC');
  assert.equal(parsed.elevator_brand, 'Otis');
  assert.equal(parsed.elevator_model, 'Gen2 MRL');
  assert.equal(parsed.totals.subtotal, 550);
  assert.equal(parsed.totals.tax, 33);
  assert.equal(parsed.totals.total, 583);
  assert.ok(parsed.line_items.length >= 2);
});
