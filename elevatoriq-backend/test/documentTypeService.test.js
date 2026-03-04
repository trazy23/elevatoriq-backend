const test = require('node:test');
const assert = require('node:assert/strict');
const {
  detectDocumentType,
  inferReviewTypeFromDocuments,
} = require('../src/services/documentTypeService');

test('detectDocumentType maps core filenames deterministically', () => {
  assert.equal(detectDocumentType({ fileName: 'March_Invoice_123.pdf' }), 'invoice');
  assert.equal(detectDocumentType({ fileName: 'Full_Service_Contract_2026.docx' }), 'maintenance_contract');
  assert.equal(detectDocumentType({ fileName: 'Modernization_Bid_Otis.pdf' }), 'modernization_bid');
  assert.equal(detectDocumentType({ fileName: 'New_Construction_Bid_TKE.pdf' }), 'new_construction_bid');
});

test('inferReviewTypeFromDocuments resolves expected workflow review type', () => {
  assert.equal(inferReviewTypeFromDocuments([{ file_type: 'invoice' }]), 'invoice_review');
  assert.equal(inferReviewTypeFromDocuments([{ file_type: 'maintenance_contract' }]), 'contract_coverage');
  assert.equal(
    inferReviewTypeFromDocuments([
      { file_type: 'modernization_bid' },
      { file_type: 'new_construction_bid' },
    ]),
    'modernization_comparison'
  );
  assert.equal(inferReviewTypeFromDocuments([{ file_type: 'new_construction_bid' }]), 'single_modernization');
});
