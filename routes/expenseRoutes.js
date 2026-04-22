const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
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
  .post(createExpense);

router.route('/summary')
  .get(getExpenseSummary);

router.route('/:id')
  .get(getExpenseById)
  .put(updateExpense)
  .delete(deleteExpense);

module.exports = router;
