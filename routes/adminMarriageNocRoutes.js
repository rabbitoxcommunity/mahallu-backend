const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const {
  createNoc,
  getAllNocs,
  getNocById,
  updateNoc,
  generatePDF,
  viewPDF
} = require('../controllers/marriageNocController');

// Admin routes (auth required)
router.use(auth);

router.post('/create', createNoc);
router.get('/', getAllNocs);
router.get('/:id', getNocById);
router.put('/:id', updateNoc);
router.get('/:id/pdf', generatePDF);
router.get('/:id/pdf/view', viewPDF);

module.exports = router;
