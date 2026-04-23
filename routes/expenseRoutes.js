const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const upload = require('../middleware/upload');
const {
  getExpenses,
  getExpenseById,
  createExpense,
  updateExpense,
  deleteExpense,
  getExpenseSummary
} = require('../controllers/expenseController');

router.use(auth);

router.route('/')
  .get(getExpenses)
  .post(upload.single('bill_file'), createExpense);

router.route('/summary')
  .get(getExpenseSummary);

router.route('/:id')
  .get(getExpenseById)
  .put(upload.single('bill_file'), updateExpense)
  .delete(deleteExpense);

module.exports = router;
