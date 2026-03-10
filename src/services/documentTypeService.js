const path = require('path');

const DOC_TYPE = {
  INVOICE: 'invoice',
  MAINTENANCE_CONTRACT: 'maintenance_contract',
  MODERNIZATION_BID: 'modernization_bid',
  NEW_CONSTRUCTION_BID: 'new_construction_bid',
  MAINTENANCE_BID: 'maintenance_bid',
  PROPOSAL: 'proposal',
  CONTRACT: 'contract',
  OTHER: 'other',
};

function normalizeText(input = '') {
  return String(input || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function detectDocumentType({ fileName = '', explicitType = '' }) {
  if (explicitType) return explicitType;

  const normalized = normalizeText(path.basename(fileName));

  const rules = [
    { type: DOC_TYPE.INVOICE, keywords: ['invoice', 'inv ', 'billing', 'statement'] },
    { type: DOC_TYPE.MAINTENANCE_CONTRACT, keywords: ['maintenance contract', 'service contract', 'full service', 'service agreement'] },
    { type: DOC_TYPE.MODERNIZATION_BID, keywords: ['modernization bid', 'modernization proposal', 'modernization quote', 'mod bid'] },
    { type: DOC_TYPE.NEW_CONSTRUCTION_BID, keywords: ['new construction bid', 'construction bid', 'new install bid', 'new installation proposal'] },
    { type: DOC_TYPE.MAINTENANCE_BID, keywords: ['maintenance bid', 'service bid', 'maintenance proposal'] },
    { type: DOC_TYPE.CONTRACT, keywords: ['contract', 'agreement'] },
    { type: DOC_TYPE.PROPOSAL, keywords: ['proposal', 'bid', 'quote', 'rfp response'] },
  ];

  for (const rule of rules) {
    if (rule.keywords.some((keyword) => normalized.includes(keyword))) {
      return rule.type;
    }
  }

  const ext = path.extname(fileName).toLowerCase();
  if (ext === '.pdf' || ext === '.doc' || ext === '.docx') {
    return DOC_TYPE.OTHER;
  }

  return DOC_TYPE.OTHER;
}

function inferReviewTypeFromDocuments(documentRows = []) {
  const types = documentRows.map((doc) => doc.file_type || DOC_TYPE.OTHER);

  const invoiceCount = types.filter((t) => t === DOC_TYPE.INVOICE).length;
  const maintenanceContractCount = types.filter((t) => t === DOC_TYPE.MAINTENANCE_CONTRACT || t === DOC_TYPE.CONTRACT).length;
  const maintenanceBidCount = types.filter((t) => t === DOC_TYPE.MAINTENANCE_BID).length;
  const modernizationBidCount = types.filter((t) => t === DOC_TYPE.MODERNIZATION_BID).length;
  const newConstructionBidCount = types.filter((t) => t === DOC_TYPE.NEW_CONSTRUCTION_BID).length;
  const genericProposalCount = types.filter((t) => t === DOC_TYPE.PROPOSAL).length;

  // Deterministic precedence:
  // 1) Any invoice => invoice_review
  if (invoiceCount > 0) return 'invoice_review';

  // 2) Maintenance bids => maintenance comparison (if >1) else contract coverage
  if (maintenanceBidCount > 1) return 'maintenance_bid_comparison';
  if (maintenanceBidCount === 1 && maintenanceContractCount > 0) return 'contract_coverage';

  // 3) Modernization / new construction bids => comparison vs single-bid path
  const capexBidCount = modernizationBidCount + newConstructionBidCount + genericProposalCount;
  if (capexBidCount > 1) return 'modernization_comparison';
  if (capexBidCount === 1) return 'single_modernization';

  // 4) Contract-heavy fallback
  if (maintenanceContractCount > 0) return 'contract_coverage';

  // 5) Safe default
  return 'contract_coverage';
}

module.exports = {
  DOC_TYPE,
  detectDocumentType,
  inferReviewTypeFromDocuments,
};
