const express = require('express');
const multer = require('multer');
const extractionService = require('../services/extractionService');
const invoiceParserService = require('../services/invoiceParserService');
const { validateParsedInvoiceData, validateParseInvoiceResponse } = require('../validation/invoiceParseSchemas');

function createInvoiceRouter(deps = {}) {
  const router = express.Router();

  const extractTextFromBuffer = deps.extractTextFromBuffer || extractionService.extractTextFromBuffer;
  const parseInvoiceText = deps.parseInvoiceText || invoiceParserService.parseInvoiceText;
  const validateData = deps.validateParsedInvoiceData || validateParsedInvoiceData;
  const validateResponse = deps.validateParseInvoiceResponse || validateParseInvoiceResponse;

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 15 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      if (file.mimetype === 'application/pdf') return cb(null, true);
      cb(new Error('Unsupported file type. PDF only.'));
    },
  });

  router.post('/parse', (req, res) => {
    upload.single('file')(req, res, async (uploadErr) => {
      if (uploadErr) {
        const message = uploadErr.message || 'Upload failed';
        if (/file too large/i.test(message)) {
          return res.status(413).json({ error: 'File too large. Maximum allowed size is 15MB.' });
        }
        return res.status(400).json({ error: message });
      }

      try {
        if (!req.file) {
          return res.status(400).json({
            error: 'No PDF file provided. Use multipart/form-data with field name "file".',
          });
        }

        const extractedText = await extractTextFromBuffer(req.file.buffer, '.pdf', req.file.originalname);

        if (!extractedText || /^\[EXTRACTION FAILED:/i.test(String(extractedText))) {
          return res.status(422).json({ error: 'PDF appears to be image-based or empty — no extractable text found' });
        }

        const parsed = parseInvoiceText(extractedText);
        if (!validateData(parsed)) {
          console.error('Invoice parse data schema validation failed:', validateData.errors);
          return res.status(500).json({ error: 'Parsed invoice payload failed schema validation' });
        }

        const responsePayload = {
          success: true,
          file_name: req.file.originalname,
          extracted_characters: extractedText.length,
          data: parsed,
        };

        if (!validateResponse(responsePayload)) {
          console.error('Invoice parse response schema validation failed:', validateResponse.errors);
          return res.status(500).json({ error: 'Invoice parse response failed schema validation' });
        }

        return res.json(responsePayload);
      } catch (err) {
        console.error('POST /api/invoice/parse error:', err);

        const message = err?.message || 'Failed to parse invoice PDF';
        if (/image-based|extractable text/i.test(message)) {
          return res.status(422).json({ error: message });
        }

        return res.status(500).json({ error: message });
      }
    });
  });

  return router;
}

module.exports = createInvoiceRouter();
module.exports.createInvoiceRouter = createInvoiceRouter;
