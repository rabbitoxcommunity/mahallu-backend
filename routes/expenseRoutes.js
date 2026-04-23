const express = require('express');
const router = express.Router();
const multer = require('multer');
const auth = require('../middleware/auth');
const {
  getExpenses,
  getExpenseById,
  createExpense,
  updateExpense,
  deleteExpense,
  getExpenseSummary
} = require('../controllers/expenseController');

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

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
