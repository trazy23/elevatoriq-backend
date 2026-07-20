const Ajv = require('ajv');
const ajv = new Ajv({ allErrors: true });

const nullableString = { type: ['string', 'null'] };
const nullableNumber = { type: ['number', 'null'] };

const evidenceAnchorSchema = {
  type: 'object',
  properties: {
    document: nullableString,
    page: nullableString,
    section: nullableString,
    quote: nullableString,
    amount: nullableNumber
  }
};

const findingSchema = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    label: { type: 'string' },
    classification: nullableString,
    severity: { type: 'string', enum: ['high', 'medium', 'low', 'info', 'HIGH', 'MEDIUM', 'LOW', 'INFO'] },
    confidence: { type: 'string', enum: ['high', 'medium-high', 'medium_high', 'medium', 'low', 'HIGH', 'MEDIUM-HIGH', 'MEDIUM_HIGH', 'MEDIUM', 'LOW'] },
    evidence_anchor: evidenceAnchorSchema,
    description: nullableString,
    why_it_matters: nullableString,
    recommendation: nullableString,
    ask_the_vendor: nullableString,
    requested_backup: nullableString,
    decision_ready: { type: ['boolean', 'null'] }
  }
};

const schema = {
  type: 'object',
  required: ['module', 'state', 'market', 'equipment_type', 'confidence_overall'],
  properties: {
    schema_version: { type: 'string' },
    case_id: { type: 'string' },
    review_type: {
      type: ['string', 'null'],
      enum: ['invoice_review', 'contract_coverage', 'single_modernization', 'modernization_comparison', 'maintenance_bid_comparison', 'advisory_analysis', null]
    },
    review_type_confidence: { type: ['string', 'null'], enum: ['high', 'medium', 'low', null] },
    module: { type: 'string', enum: ['A', 'B', 'C'] },
    state: { type: ['string', 'null'], maxLength: 2 },
    market: { type: ['string', 'null'] },
    equipment_type: { type: ['string', 'null'] },
    contract_type: { type: ['string', 'null'] },
    unit_count: { type: ['integer', 'null'] },
    confidence_overall: { type: 'string', enum: ['high', 'medium', 'low'] },
    benchmark_version: { type: ['string', 'null'] },
    scope_type: { type: ['string', 'null'] },
    contract_value: { type: ['number', 'null'] },
    elevatoriq_score: { type: ['number', 'null'] },
    score_label: { type: ['string', 'null'] },
    executive_summary: { type: ['string', 'null'] },
    documents_reviewed: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          label: { type: 'string' },
          type: nullableString,
          date: nullableString,
          pages: { type: ['integer', 'null'] },
          notes: nullableString
        }
      }
    },
    vendors: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          label: { type: 'string' },
          name_preserved: { type: ['boolean', 'null'] },
          proposal_type: nullableString
        }
      }
    },
    flags: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          label: { type: 'string' },
          severity: { type: 'string', enum: ['high', 'medium', 'low', 'info', 'HIGH', 'MEDIUM', 'LOW', 'INFO'] },
          confidence: { type: ['string', 'null'] },
          evidence_anchor: evidenceAnchorSchema,
          description: { type: 'string' },
          recommendation: { type: 'string' }
        }
      }
    },
    findings: {
      type: 'array',
      items: findingSchema
    },
    questions_to_ask: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          vendor_label: nullableString,
          category: nullableString,
          question: { type: 'string' },
          tied_finding: nullableString
        }
      }
    },
    missing_documents: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          document_type: { type: 'string' },
          reason_needed: nullableString,
          priority: { type: ['string', 'null'], enum: ['high', 'medium', 'low', null] }
        }
      }
    },
    decision_readiness: {
      type: 'object',
      properties: {
        status: {
          type: ['string', 'null'],
          enum: ['decision_ready_with_conditions', 'not_decision_ready', 'needs_professional_review', 'informational_only', null]
        },
        summary: nullableString,
        blockers: { type: 'array', items: { type: 'string' } }
      }
    },
    normalized_price_comparison: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          vendor_label: nullableString,
          base_price: nullableNumber,
          annual_price: nullableNumber,
          monthly_price: nullableNumber,
          effective_price_low: nullableNumber,
          effective_price_high: nullableNumber,
          unit_count: { type: ['integer', 'null'] },
          notes: nullableString
        }
      }
    },
    scope_matrix: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          category: { type: 'string' },
          vendor_label: nullableString,
          status: nullableString,
          evidence_anchor: evidenceAnchorSchema,
          notes: nullableString
        }
      }
    },
    coverage_matrix: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          category: { type: 'string' },
          vendor_label: nullableString,
          status: nullableString,
          evidence_anchor: evidenceAnchorSchema,
          notes: nullableString
        }
      }
    },
    labor_data: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          rate_regular: { type: ['number', 'null'] },
          rate_overtime: { type: ['number', 'null'] },
          overtime_multiplier: { type: ['number', 'null'] },
          travel_minimum_hours: { type: ['number', 'null'] },
          contract_type: { type: ['string', 'null'] }
        }
      }
    },
    line_items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          taxonomy_category: { type: 'string' },
          description_normalized: { type: ['string', 'null'] },
          amount_billed: { type: ['number', 'null'] },
          labor_hours: { type: ['number', 'null'] },
          scope_flag: { type: ['string', 'null'] },
          billing_flag: { type: ['string', 'null'] },
          evidence_anchor: evidenceAnchorSchema,
          confidence: { type: ['string', 'null'] }
        }
      }
    },
    parts_data: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          taxonomy_category: { type: 'string' },
          part_cost: { type: ['number', 'null'] },
          material_markup_percent: { type: ['number', 'null'] },
          parts_coverage_type: { type: ['string', 'null'] },
          evidence_anchor: evidenceAnchorSchema,
          confidence: { type: ['string', 'null'] }
        }
      }
    },
    contract_terms: {
      type: 'object',
      properties: {
        base_price_per_unit: { type: ['number', 'null'] },
        monthly_price: { type: ['number', 'null'] },
        annual_price: { type: ['number', 'null'] },
        term_years: { type: ['number', 'null'] },
        auto_renew_flag: { type: ['boolean', 'null'] },
        cancellation_notice_days: { type: ['integer', 'null'] },
        escalation_type: { type: ['string', 'null'] },
        escalation_percent: { type: ['number', 'null'] },
        warranty_months: { type: ['integer', 'null'] },
        pm_frequency_per_year: { type: ['integer', 'null'] },
        callback_coverage: { type: ['string', 'null'] },
        after_hours_policy: { type: ['string', 'null'] },
        parts_coverage: { type: ['string', 'null'] },
        travel_minimum_policy: { type: ['string', 'null'] },
        material_markup_percent: { type: ['number', 'null'] }
      }
    }
  }
};

module.exports = { validate: ajv.compile(schema) };
