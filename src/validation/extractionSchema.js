const Ajv = require('ajv');
const ajv = new Ajv({ allErrors: true });

const schema = {
  type: 'object',
  required: ['module', 'state', 'market', 'equipment_type', 'confidence_overall'],
  properties: {
    schema_version: { type: 'string' },
    case_id: { type: 'string' },
    module: { type: 'string', enum: ['A', 'B', 'C'] },
    state: { type: ['string', 'null'], maxLength: 2 },
    market: { type: ['string', 'null'] },
    equipment_type: { type: ['string', 'null'] },
    contract_type: { type: ['string', 'null'] },
    unit_count: { type: ['integer', 'null'] },
    confidence_overall: { type: 'string', enum: ['high', 'medium', 'low'] },
    benchmark_version: { type: ['string', 'null'] },
    flags: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          label: { type: 'string' },
          severity: { type: 'string', enum: ['high', 'medium', 'low', 'info'] },
          description: { type: 'string' },
          recommendation: { type: 'string' }
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
          billing_flag: { type: ['string', 'null'] }
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
          parts_coverage_type: { type: ['string', 'null'] }
        }
      }
    },
    contract_terms: {
      type: 'object',
      properties: {
        base_price_per_unit: { type: ['number', 'null'] },
        term_years: { type: ['number', 'null'] },
        auto_renew_flag: { type: ['boolean', 'null'] },
        escalation_type: { type: ['string', 'null'] },
        escalation_percent: { type: ['number', 'null'] },
        warranty_months: { type: ['integer', 'null'] },
        pm_frequency_per_year: { type: ['integer', 'null'] },
        after_hours_policy: { type: ['string', 'null'] }
      }
    }
  }
};

module.exports = { validate: ajv.compile(schema) };
