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

const parseInvoiceResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['success', 'file_name', 'extracted_characters', 'data'],
  properties: {
    success: { type: 'boolean', const: true },
    file_name: { type: 'string', minLength: 1 },
    extracted_characters: { type: 'integer', minimum: 0 },
    data: parsedInvoiceDataSchema,
  },
};

const validateParsedInvoiceData = ajv.compile(parsedInvoiceDataSchema);
const validateParseInvoiceResponse = ajv.compile(parseInvoiceResponseSchema);

module.exports = {
  validateParsedInvoiceData,
  validateParseInvoiceResponse,
};
