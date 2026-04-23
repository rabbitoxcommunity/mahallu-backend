const express = require('express');
const router = express.Router();
const {
  getDashboardSummary,
  getMonthlyReport,
  getIncomeReport,
  getExpenseReport,
  getVarisankhyaReport
} = require('../controllers/reportController');
const auth = require('../middleware/auth');

// All routes are protected
router.use(auth);

// Dashboard
router.get('/dashboard', getDashboardSummary);

// Monthly Report
router.get('/monthly', getMonthlyReport);

// Income Report
router.get('/income', getIncomeReport);

// Expense Report
router.get('/expense', getExpenseReport);

// Varisankhya Report
router.get('/varisankhya', getVarisankhyaReport);

module.exports = router;
