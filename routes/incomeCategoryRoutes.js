const express = require('express');
const router = express.Router();
const {
  getIncomeCategories,
  getIncomeCategoryById,
  createIncomeCategory,
  updateIncomeCategory,
  deleteIncomeCategory
} = require('../controllers/incomeCategoryController');
const auth = require('../middleware/auth');

router.route('/')
  .get(auth, getIncomeCategories)
  .post(auth, createIncomeCategory);

router.route('/:id')
  .get(auth, getIncomeCategoryById)
  .put(auth, updateIncomeCategory)
  .delete(auth, deleteIncomeCategory);

module.exports = router;
