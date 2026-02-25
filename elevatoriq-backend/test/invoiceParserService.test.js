const test = require('node:test');
const assert = require('node:assert/strict');
const { parseInvoiceText, parseMoneyToNumber } = require('../src/services/invoiceParserService');

test('parseMoneyToNumber handles US, EU and negative formats', () => {
  assert.equal(parseMoneyToNumber('$1,234.56'), 1234.56);
  assert.equal(parseMoneyToNumber('1.234,56'), 1234.56);
  assert.equal(parseMoneyToNumber('(250.00)'), -250);
  assert.equal(parseMoneyToNumber('-$42.10'), -42.1);
});

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
  assert.equal(parsed.elevator_brand, 'OTIS');
  assert.equal(parsed.elevator_model, 'Gen2 MRL');
  assert.equal(parsed.totals.subtotal, 550);
  assert.equal(parsed.totals.tax, 33);
  assert.equal(parsed.totals.total, 583);
  assert.ok(parsed.line_items.length >= 2);
});

test('parseInvoiceText handles table-like layouts and infers subtotal when missing', () => {
  const input = `
    [PDF: 2 pages]
    TK Elevator Northeast
    INVOICE
    Manufacturer: TKE
    Unit Model: Evolution 200

    Qty Description Unit Price Amount
    3 PM Service Visit 150.00 450.00
    1 Door Operator Belt Replacement 89.99 89.99
    Sales Tax 27.30
    Amount Due 567.29
  `;

  const parsed = parseInvoiceText(input);

  assert.equal(parsed.vendor, 'TK Elevator Northeast');
  assert.equal(parsed.elevator_brand, 'TK ELEVATOR');
  assert.equal(parsed.elevator_model, 'Evolution 200');
  assert.equal(parsed.totals.tax, 27.3);
  assert.equal(parsed.totals.total, 567.29);
  assert.equal(parsed.totals.subtotal, 539.99);
  assert.equal(parsed.line_items.length, 2);
  assert.equal(parsed.line_items[0].quantity, 3);
  assert.equal(parsed.line_items[0].unit_price, 150);
  assert.equal(parsed.line_items[0].total, 450);
});
