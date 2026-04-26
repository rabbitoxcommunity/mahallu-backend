const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const {
  createMarriage,
  getAllMarriages,
  getMarriageById,
  updateMarriage,
  generatePDF
} = require('../controllers/marriageController');

// Admin routes (auth required)
router.use(auth);

router.post('/create', createMarriage);
router.get('/', getAllMarriages);
router.get('/:id', getMarriageById);
router.put('/:id', updateMarriage);
router.get('/:id/pdf', generatePDF);

module.exports = router;
