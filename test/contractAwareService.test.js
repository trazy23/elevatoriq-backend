const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildFactsFromTerms,
  parseContractTermsFromText,
  calculatePortfolioWatchPrice,
  computeCancellationDeadline,
  reviewDocumentAgainstContract,
} = require('../src/services/contractAwareService');

test('calculatePortfolioWatchPrice applies marginal tiers and floor', () => {
  assert.equal(calculatePortfolioWatchPrice(3).monthly, 300);
  assert.equal(calculatePortfolioWatchPrice(20).monthly, 500);
  assert.equal(calculatePortfolioWatchPrice(40).monthly, 925);
  assert.equal(calculatePortfolioWatchPrice(100).monthly, 2000);
  assert.equal(calculatePortfolioWatchPrice(40).annual_prepay, 9250);
});

test('buildFactsFromTerms confidence-gates material terms with source snippets', () => {
  const facts = buildFactsFromTerms({
    cancellation_notice_days: { value: 90, confidence: 0.89, source_snippet: 'Ninety days notice required.' },
    vendor: { value: 'Otis', confidence: 0.96, source_snippet: 'Otis Elevator Company agreement.' },
  });
  const cancellation = facts.find((fact) => fact.field_name === 'cancellation_notice_days');
  const vendor = facts.find((fact) => fact.field_name === 'vendor');
  assert.equal(cancellation.needs_confirmation, true);
  assert.equal(vendor.needs_confirmation, false);
  assert.equal(cancellation.source_snippet, 'Ninety days notice required.');
});

test('computeCancellationDeadline subtracts notice period from end date', () => {
  assert.equal(computeCancellationDeadline({ end_date: '2028-12-31', cancellation_notice_days: 90 }), '2028-10-02');
});

test('parseContractTermsFromText creates confirm-before-reliance terms with source snippets', () => {
  const extraction = parseContractTermsFromText('Agreement between Otis Elevator Company and Owner. Customer shall pay $1,200.00 per month. Term commences January 1, 2026 and expires December 31, 2028. This agreement shall automatically renew unless cancelled by written notice at least ninety (90) days before expiration. Overtime callbacks are billable.');
  assert.match(extraction.terms.vendor.value, /Otis/);
  assert.equal(extraction.terms.monthly_price.value, '1200');
  assert.equal(extraction.terms.cancellation_notice_days.value, '90');
  assert.ok(extraction.terms.cancellation_notice_days.source_snippet.includes('ninety'));
});

test('repair quote review returns red when quote is vague and contract memory is missing', () => {
  const result = reviewDocumentAgainstContract({
    reviewType: 'repair_quote',
    documentText: 'Proposal: repair elevator. Lump sum $31,000.',
    contract: {},
    facts: [],
  });
  assert.equal(result.decision_status, 'red');
  assert.equal(result.escalated, true);
  assert.ok(result.findings.some((finding) => finding.category === 'contract_memory_missing'));
  assert.ok(result.vendor_email.body.includes('Before we finalize review'));
});

test('invoice check flags amount mismatch against contract monthly price', () => {
  const result = reviewDocumentAgainstContract({
    reviewType: 'invoice_check',
    documentText: 'Monthly maintenance invoice plus fuel surcharge. Total Due $1,450.00',
    contract: { id: 'contract-1', monthly_price: 1200, vendor: 'KONE' },
    facts: [{ field_name: 'monthly_price', field_value: '1200', source_snippet: 'Monthly maintenance fee shall be $1,200.' }],
  });
  assert.equal(result.decision_status, 'yellow');
  assert.ok(result.findings.some((finding) => finding.category === 'price_mismatch'));
  assert.ok(result.vendor_email.body.includes('KONE maintenance agreement'));
});
