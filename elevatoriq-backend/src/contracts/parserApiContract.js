/**
 * Parser API contract artifact for consuming applications.
 *
 * Endpoint: POST /api/invoice/parse
 * Content-Type: multipart/form-data
 * Required file field: file (PDF, <= 15 MB)
 */

const PARSER_API_ROUTE = '/api/invoice/parse';

/**
 * @typedef {Object} ParserLineItem
 * @property {string} description
 * @property {number} quantity
 * @property {number} unit_price
 * @property {number} total
 */

/**
 * @typedef {Object} ParserTotals
 * @property {number} subtotal
 * @property {number} tax
 * @property {number} total
 */

/**
 * @typedef {Object} ParsedInvoiceData
 * @property {string|null} vendor
 * @property {string|null} elevator_brand
 * @property {string|null} elevator_model
 * @property {ParserLineItem[]} line_items
 * @property {ParserTotals} totals
 */

/**
 * @typedef {Object} ParserSuccessResponse
 * @property {true} success
 * @property {string} file_name
 * @property {number} extracted_characters
 * @property {ParsedInvoiceData} data
 */

/**
 * @typedef {Object} ParserErrorResponse
 * @property {string} error
 */

module.exports = {
  PARSER_API_ROUTE,
};
