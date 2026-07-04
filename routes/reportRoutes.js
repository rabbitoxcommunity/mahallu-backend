const express = require('express');
const router = express.Router();
const {
  getSummary,
  getStatement,
  getTrends,
  exportReport,
  getIncomeReport,
  getExpenseReport
} = require('../controllers/reportController');
const auth = require('../middleware/auth');

// All routes are protected
router.use(auth);

// Summary
router.get('/summary', getSummary);

// Income tab
router.get('/income', getIncomeReport);

// Expense tab
router.get('/expense', getExpenseReport);

// Financial Statement
router.get('/statement', getStatement);

// Trends
router.get('/trends', getTrends);

// Export
router.get('/export', exportReport);

module.exports = router;
