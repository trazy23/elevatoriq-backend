const express = require('express');
const router = express.Router({ mergeParams: true });
const multer = require('multer');
const db = require('../db');
const storageService = require('../services/storageService');
const storageServiceMock = require('../services/storageService-mock');
const { detectDocumentType } = require('../services/documentTypeService');

const path = require('path');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/octet-stream', // some clients send legacy docs as generic binary
    ];
    const ext = (path.extname(file.originalname || '') || '').toLowerCase();
    const allowedExts = ['.pdf', '.doc', '.docx'];

    if (allowedMimes.includes(file.mimetype) && allowedExts.includes(ext)) return cb(null, true);
    if (allowedExts.includes(ext)) return cb(null, true); // extension fallback

    cb(new Error('Unsupported file type. PDF, DOC, DOCX only.'));
  }
});

const MAX_BATCH_FILES = 10;

async function persistDocument({ caseId, file, fileType }) {
  const autoDetected = !fileType;
  const detectedType = detectDocumentType({ fileName: file.originalname, explicitType: fileType });
  
  let storagePath;
  try {
    storagePath = await storageService.upload(file, caseId);
  } catch (err) {
    console.warn(`[Documents] Real storage failed (${err.message}), using mock storage`);
    // Generate a mock storage key
    storagePath = `case-${caseId}/${file.originalname}`;
    await storageServiceMock.upload(file.buffer, storagePath);
  }

  const result = await db.query(
    `INSERT INTO documents (case_id, file_name, file_type, storage_path, auto_detected)
     VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [caseId, file.originalname, detectedType, storagePath, autoDetected]
  );

  return {
    document_id: result.rows[0].id,
    file_name: file.originalname,
    auto_detected_type: detectedType,
  };
}

// POST /api/cases/:id/documents — Upload file
router.post('/', upload.single('file'), async (req, res) => {
  try {
    const { id } = req.params;
    if (!req.file) return res.status(400).json({ error: 'No file provided' });

    const record = await persistDocument({
      caseId: id,
      file: req.file,
      fileType: req.body.file_type,
    });

    res.json(record);
  } catch (err) {
    console.error('POST /documents error:', err);
    res.status(500).json({ error: err.message || 'Failed to upload document' });
  }
});

// POST /api/cases/:id/documents/batch — Upload multiple files
router.post('/batch', upload.array('files', MAX_BATCH_FILES), async (req, res) => {
  try {
    const { id } = req.params;
    const files = req.files || [];
    if (!files.length) return res.status(400).json({ error: 'No files provided' });

    const explicitTypes = Array.isArray(req.body.file_types)
      ? req.body.file_types
      : typeof req.body.file_types === 'string'
        ? req.body.file_types.split(',').map((item) => item.trim())
        : [];

    const uploaded = [];
    for (let i = 0; i < files.length; i += 1) {
      const file = files[i];
      const fileType = explicitTypes[i] || null;
      uploaded.push(await persistDocument({ caseId: id, file, fileType }));
    }

    res.json({
      case_id: id,
      uploaded_count: uploaded.length,
      documents: uploaded,
    });
  } catch (err) {
    console.error('POST /documents/batch error:', err);
    res.status(500).json({ error: err.message || 'Failed to upload batch documents' });
  }
});

module.exports = router;
module.exports.persistDocument = persistDocument;
module.exports.MAX_BATCH_FILES = MAX_BATCH_FILES;
