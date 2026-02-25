const Ajv = require('ajv');

const ajv = new Ajv({ allErrors: true, removeAdditional: false });

const parsedInvoiceDataSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['vendor', 'elevator_brand', 'elevator_model', 'line_items', 'totals'],
  properties: {
    vendor: { type: ['string', 'null'] },
    elevator_brand: { type: ['string', 'null'] },
    elevator_model: { type: ['string', 'null'] },
    line_items: {
      type: 'array',
      maxItems: 75,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['description', 'quantity', 'unit_price', 'total'],
        properties: {
          description: { type: 'string', minLength: 1, maxLength: 500 },
          quantity: { type: ['number', 'null'] },
          unit_price: { type: ['number', 'null'] },
          total: { type: ['number', 'null'] },
        },
      },
    },
    totals: {
      type: 'object',
      additionalProperties: false,
      required: ['subtotal', 'tax', 'total'],
      properties: {
        subtotal: { type: ['number', 'null'] },
        tax: { type: ['number', 'null'] },
        total: { type: ['number', 'null'] },
      },
    },
  },
};

const confidenceSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['overall', 'overall_score', 'fields', 'methodology'],
  properties: {
    overall: { type: 'string', enum: ['high', 'medium', 'low'] },
    overall_score: { type: 'number', minimum: 0, maximum: 1 },
    fields: {
      type: 'object',
      additionalProperties: false,
      required: [
        'vendor',
        'elevator_brand',
        'elevator_model',
        'totals_subtotal',
        'totals_tax',
        'totals_total',
        'line_items_count',
      ],
      properties: {
        vendor: { type: 'number', minimum: 0, maximum: 1 },
        elevator_brand: { type: 'number', minimum: 0, maximum: 1 },
        elevator_model: { type: 'number', minimum: 0, maximum: 1 },
        totals_subtotal: { type: 'number', minimum: 0, maximum: 1 },
        totals_tax: { type: 'number', minimum: 0, maximum: 1 },
        totals_total: { type: 'number', minimum: 0, maximum: 1 },
        line_items_count: { type: 'number', minimum: 0, maximum: 1 },
      },
    },
    methodology: { type: 'string', minLength: 1 },
  },
};

const normalizedOutputSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['supplier_name', 'oem_brand', 'oem_model', 'currency', 'totals', 'line_items', 'bid_analysis'],
  properties: {
    supplier_name: { type: ['string', 'null'] },
    oem_brand: { type: ['string', 'null'] },
    oem_model: { type: ['string', 'null'] },
    currency: { type: 'string', minLength: 3, maxLength: 3 },
    totals: {
      type: 'object',
      additionalProperties: false,
      required: ['subtotal_amount', 'tax_amount', 'invoice_total_amount'],
      properties: {
        subtotal_amount: { type: ['number', 'null'] },
        tax_amount: { type: ['number', 'null'] },
        invoice_total_amount: { type: ['number', 'null'] },
      },
    },
    line_items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['index', 'title', 'quantity', 'unit_amount', 'line_total', 'category_hint'],
        properties: {
          index: { type: 'integer', minimum: 0 },
          title: { type: 'string', minLength: 1 },
          quantity: { type: ['number', 'null'] },
          unit_amount: { type: ['number', 'null'] },
          line_total: { type: ['number', 'null'] },
          category_hint: { type: 'string', enum: ['labor', 'parts_or_other'] },
        },
      },
    },
    bid_analysis: {
      type: 'object',
      additionalProperties: false,
      required: ['inferred_service_scope', 'inferred_vendor_slug'],
      properties: {
        inferred_service_scope: { type: 'array', items: { type: 'string' } },
        inferred_vendor_slug: { type: ['string', 'null'] },
      },
    },
  },
};

const parseInvoiceResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['success', 'file_name', 'extracted_characters', 'data', 'normalized', 'confidence'],
  properties: {
    success: { type: 'boolean', const: true },
    file_name: { type: 'string', minLength: 1 },
    extracted_characters: { type: 'integer', minimum: 0 },
    data: parsedInvoiceDataSchema,
    normalized: normalizedOutputSchema,
    confidence: confidenceSchema,
  },
};

const parserErrorResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['success', 'error'],
  properties: {
    success: { type: 'boolean', const: false },
    error: {
      type: 'object',
      additionalProperties: false,
      required: ['code', 'message', 'http_status', 'retryable'],
      properties: {
        code: { type: 'string', minLength: 1 },
        message: { type: 'string', minLength: 1 },
        http_status: { type: 'integer', minimum: 400, maximum: 599 },
        retryable: { type: 'boolean' },
        details: {},
      },
    },
  },
};

const validateParsedInvoiceData = ajv.compile(parsedInvoiceDataSchema);
const validateParseInvoiceResponse = ajv.compile(parseInvoiceResponseSchema);
const validateParserErrorResponse = ajv.compile(parserErrorResponseSchema);

module.exports = {
  validateParsedInvoiceData,
  validateParseInvoiceResponse,
  validateParserErrorResponse,
};