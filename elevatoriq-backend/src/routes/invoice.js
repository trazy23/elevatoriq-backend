const express = require('express');
const multer = require('multer');
const extractionService = require('../services/extractionService');
const invoiceParserService = require('../services/invoiceParserService');
const {
  validateParsedInvoiceData,
  validateParseInvoiceResponse,
  validateParserErrorResponse,
} = require('../validation/invoiceParseSchemas');

function createInvoiceRouter(deps = {}) {
  const router = express.Router();

  const extractTextFromBuffer = deps.extractTextFromBuffer || extractionService.extractTextFromBuffer;
  const parseInvoiceText = deps.parseInvoiceText || invoiceParserService.parseInvoiceText;
  const mapNormalizedOutput = deps.mapNormalizedOutput || invoiceParserService.mapNormalizedOutput;
  const buildConfidenceMetadata = deps.buildConfidenceMetadata || invoiceParserService.buildConfidenceMetadata;
  const validateData = deps.validateParsedInvoiceData || validateParsedInvoiceData;
  const validateResponse = deps.validateParseInvoiceResponse || validateParseInvoiceResponse;
  const validateErrorResponse = deps.validateParserErrorResponse || validateParserErrorResponse;

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 15 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      if (file.mimetype === 'application/pdf') return cb(null, true);
      cb(new Error('Unsupported file type. PDF only.'));
    },
  });

  function errorPayload(code, message, httpStatus, retryable = false, details = undefined) {
    const payload = {
      success: false,
      error: {
        code,
        message,
        http_status: httpStatus,
        retryable,
      },
    };

    if (details !== undefined) payload.error.details = details;

    if (!validateErrorResponse(payload)) {
      console.error('Invoice parse error response schema validation failed:', validateErrorResponse.errors);
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR_SCHEMA_MISMATCH',
          message: 'Invoice parser encountered a response-schema mismatch',
          http_status: 500,
          retryable: false,
        },
      };
    }

    return payload;
  }

  router.post('/parse', (req, res) => {
    upload.single('file')(req, res, async (uploadErr) => {
      if (uploadErr) {
        const message = uploadErr.message || 'Upload failed';
        if (/file too large/i.test(message)) {
          return res.status(413).json(errorPayload(
            'FILE_TOO_LARGE',
            'File too large. Maximum allowed size is 15MB.',
            413,
            false
          ));
        }
        return res.status(400).json(errorPayload('UNSUPPORTED_OR_INVALID_UPLOAD', message, 400, false));
      }

      try {
        if (!req.file) {
          return res.status(400).json(errorPayload(
            'MISSING_FILE',
            'No PDF file provided. Use multipart/form-data with field name "file".',
            400,
            false
          ));
        }

        const extractedText = await extractTextFromBuffer(req.file.buffer, '.pdf', req.file.originalname);

        if (!extractedText || /^\[EXTRACTION FAILED:/i.test(String(extractedText))) {
          return res.status(422).json(errorPayload(
            'UNREADABLE_DOCUMENT',
            'PDF appears to be image-based or empty — no extractable text found.',
            422,
            false,
            { reason: 'text_extraction_failed' }
          ));
        }

        const parsed = parseInvoiceText(extractedText);
        if (!validateData(parsed)) {
          console.error('Invoice parse data schema validation failed:', validateData.errors || 'unknown');
          return res.status(500).json(errorPayload(
            'PARSED_DATA_SCHEMA_INVALID',
            'Parsed invoice payload failed schema validation.',
            500,
            true,
            { validation_errors: validateData.errors }
          ));
        }

        const responsePayload = {
          success: true,
          file_name: req.file.originalname,
          extracted_characters: extractedText.length,
          data: parsed,
          normalized: mapNormalizedOutput(parsed),
          confidence: buildConfidenceMetadata(parsed, extractedText),
        };

        if (!validateResponse(responsePayload)) {
          console.error('Invoice parse response schema validation failed:', validateResponse.errors || 'unknown');
          return res.status(500).json(errorPayload(
            'PARSE_RESPONSE_SCHEMA_INVALID',
            'Invoice parse response failed schema validation.',
            500,
            true,
            { validation_errors: validateResponse.errors }
          ));
        }

        return res.json(responsePayload);
      } catch (err) {
        console.error('POST /api/invoice/parse error:', err);

        const message = err?.message || 'Failed to parse invoice PDF';
        if (/image-based|extractable text/i.test(message)) {
          return res.status(422).json(errorPayload('UNREADABLE_DOCUMENT', message, 422, false));
        }

        return res.status(500).json(errorPayload(
          'PARSER_RUNTIME_FAILURE',
          message,
          500,
          true
        ));
      }
    });
  });

  return router;
}

module.exports = createInvoiceRouter();
module.exports.createInvoiceRouter = createInvoiceRouter;