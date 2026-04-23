const express = require('express');
const router = express.Router();
const {
  getSummary,
  getStatement,
  getTrends,
  exportReport
} = require('../controllers/reportController');
const auth = require('../middleware/auth');

// All routes are protected
router.use(auth);

// Summary
router.get('/summary', getSummary);

// Financial Statement
router.get('/statement', getStatement);

// Trends
router.get('/trends', getTrends);

// Export
router.get('/export', exportReport);

module.exports = router;
