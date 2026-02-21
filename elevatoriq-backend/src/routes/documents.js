const express = require('express');
const router = express.Router({ mergeParams: true });
const multer = require('multer');
const db = require('../db');
const storageService = require('../services/storageService');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
  fileFilter: (req, file, cb) => {
    const allowed = ['application/pdf', 'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (allowed.includes(file.mimetype)) return cb(null, true);
    cb(new Error('Unsupported file type. PDF, DOC, DOCX only.'));
  }
});

function detectType(filename) {
  const lower = filename.toLowerCase();
  if (lower.includes('invoice')) return 'invoice';
  if (lower.includes('contract')) return 'contract';
  if (lower.includes('proposal') || lower.includes('bid')) return 'proposal';
  if (lower.includes('callback') || lower.includes('log')) return 'callback_log';
  if (lower.includes('equipment') || lower.includes('list')) return 'equipment_list';
  return 'other';
}

// POST /api/cases/:id/documents — Upload file
router.post('/', upload.single('file'), async (req, res) => {
  try {
    const { id } = req.params;
    if (!req.file) return res.status(400).json({ error: 'No file provided' });

    const { file_type } = req.body;
    const autoDetected = !file_type;
    const detectedType = file_type || detectType(req.file.originalname);

    const storagePath = await storageService.upload(req.file, id);

    const result = await db.query(
      `INSERT INTO documents (case_id, file_name, file_type, storage_path, auto_detected)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [id, req.file.originalname, detectedType, storagePath, autoDetected]
    );

    res.json({
      document_id: result.rows[0].id,
      file_name: req.file.originalname,
      auto_detected_type: detectedType
    });
  } catch (err) {
    console.error('POST /documents error:', err);
    res.status(500).json({ error: err.message || 'Failed to upload document' });
  }
});

module.exports = router;
