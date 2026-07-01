const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const {
    createDueExpense,
    getDueExpenses,
    updateDueExpense,
    deleteDueExpense,
    markDueExpensePayment,
    getDueExpenseTemplateEntries,
    getDueExpenseSummary,
} = require('../controllers/dueExpenseController');

// Summary must come before /:id to avoid shadowing
router.get('/summary', auth, getDueExpenseSummary);

// Template entries must come before /:id
router.get('/:id/entries', auth, getDueExpenseTemplateEntries);

// Mark payment: /pay/:id where id = entry._id
router.put('/pay/:id', auth, markDueExpensePayment);

// CRUD for subscription templates
router.post('/create', auth, createDueExpense);
router.get('/', auth, getDueExpenses);
router.put('/:id', auth, updateDueExpense);
router.delete('/:id', auth, deleteDueExpense);

module.exports = router;
