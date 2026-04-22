const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const {
  getExpenseCategories,
  getExpenseCategoryById,
  createExpenseCategory,
  updateExpenseCategory,
  deleteExpenseCategory
} = require('../controllers/expenseCategoryController');

router.use(auth);

router.route('/')
  .get(getExpenseCategories)
  .post(createExpenseCategory);

router.route('/:id')
  .get(getExpenseCategoryById)
  .put(updateExpenseCategory)
  .delete(deleteExpenseCategory);

module.exports = router;
