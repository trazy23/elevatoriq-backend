const express = require('express');
const multer = require('multer');
const { extractTextFromBuffer } = require('../services/extractionService');
const { parseInvoiceText } = require('../services/invoiceParserService');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') return cb(null, true);
    cb(new Error('Unsupported file type. PDF only.'));
  },
});

router.post('/parse', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: 'No PDF file provided. Use multipart/form-data with field name "file".',
      });
    }

    const extractedText = await extractTextFromBuffer(req.file.buffer, '.pdf', req.file.originalname);
    const parsed = parseInvoiceText(extractedText);

    return res.json({
      success: true,
      file_name: req.file.originalname,
      extracted_characters: extractedText.length,
      data: parsed,
    });
  } catch (err) {
    console.error('POST /api/invoice/parse error:', err);

    const message = err?.message || 'Failed to parse invoice PDF';
    if (/image-based|extractable text/i.test(message)) {
      return res.status(422).json({ error: message });
    }

    return res.status(500).json({ error: message });
  }
});

module.exports = router;
