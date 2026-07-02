const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const auth    = require('../middleware/auth');
const ctrl    = require('../controllers/islamicLibraryController');

const UPLOAD_DIR = path.join(__dirname, '../public/uploads/islamic');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename:    (_req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}_${safe}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Only PDF files are allowed'));
  },
});

// ── Public routes (no auth) ──────────────────────────────────────────────────
router.get('/public/surahs', ctrl.getPublicSurahs);
router.get('/public/duas',   ctrl.getPublicDuas);

// ── Admin routes (auth required) ─────────────────────────────────────────────
// Surah
router.post('/surah',     auth, upload.single('pdf_file'), ctrl.createSurah);
router.get('/surah',      auth, ctrl.listSurahs);
router.put('/surah/:id',  auth, upload.single('pdf_file'), ctrl.updateSurah);
router.delete('/surah/:id', auth, ctrl.deleteSurah);

// Dua
router.post('/dua',       auth, upload.single('pdf_file'), ctrl.createDua);
router.get('/dua',        auth, ctrl.listDuas);
router.put('/dua/:id',    auth, upload.single('pdf_file'), ctrl.updateDua);
router.delete('/dua/:id', auth, ctrl.deleteDua);

module.exports = router;
