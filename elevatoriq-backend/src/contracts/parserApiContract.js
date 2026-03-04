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
 * @property {number|null} quantity
 * @property {number|null} unit_price
 * @property {number|null} total
 */

/**
 * @typedef {Object} ParserTotals
 * @property {number|null} subtotal
 * @property {number|null} tax
 * @property {number|null} total
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
 * @typedef {Object} ParserNormalizedLineItem
 * @property {number} index
 * @property {string} title
 * @property {number|null} quantity
 * @property {number|null} unit_amount
 * @property {number|null} line_total
 * @property {'labor'|'parts_or_other'} category_hint
 */

/**
 * @typedef {Object} ParserNormalizedOutput
 * @property {string|null} supplier_name
 * @property {string|null} oem_brand
 * @property {string|null} oem_model
 * @property {string} currency
 * @property {{ subtotal_amount:number|null, tax_amount:number|null, invoice_total_amount:number|null }} totals
 * @property {ParserNormalizedLineItem[]} line_items
 * @property {{ inferred_service_scope:string[], inferred_vendor_slug:string|null }} bid_analysis
 */

/**
 * @typedef {Object} ParserConfidenceMetadata
 * @property {'high'|'medium'|'low'} overall
 * @property {number} overall_score
 * @property {{
 *  vendor:number,
 *  elevator_brand:number,
 *  elevator_model:number,
 *  totals_subtotal:number,
 *  totals_tax:number,
 *  totals_total:number,
 *  line_items_count:number
 * }} fields
 * @property {string} methodology
 */

/**
 * @typedef {Object} ParserSuccessResponse
 * @property {true} success
 * @property {string} file_name
 * @property {number} extracted_characters
 * @property {ParsedInvoiceData} data
 * @property {ParserNormalizedOutput} normalized
 * @property {ParserConfidenceMetadata} confidence
 */

/**
 * @typedef {Object} ParserErrorShape
 * @property {string} code
 * @property {string} message
 * @property {number} http_status
 * @property {boolean} retryable
 * @property {unknown} [details]
 */

/**
 * @typedef {Object} ParserErrorResponse
 * @property {false} success
 * @property {ParserErrorShape} error
 */

module.exports = {
  PARSER_API_ROUTE,
};