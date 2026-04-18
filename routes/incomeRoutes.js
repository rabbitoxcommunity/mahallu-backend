const router = require("express").Router();
const auth = require("../middleware/auth");
const {
    // Due Based Income
    createDueIncome,
    getDueIncome,
    updateDueIncome,
    deleteDueIncome,
    markDuePayment,
    getDuePaymentHistory,
    // Direct Income
    createDirectIncome,
    getDirectIncome,
    updateDirectIncome,
    deleteDirectIncome,
    // Summary & Dashboard
    getIncomeSummary,
    updateOverdueStatus
} = require("../controllers/incomeController");

// ==================== DUE BASED INCOME ROUTES ====================

// Create due-based income
router.post("/due/create", auth, createDueIncome);

// Get all due-based income
router.get("/due", auth, getDueIncome);

// Update due-based income
router.put("/due/:id", auth, updateDueIncome);

// Delete due-based income (soft delete)
router.delete("/due/:id", auth, deleteDueIncome);

// Mark payment for due-based income
router.put("/due/pay/:id", auth, markDuePayment);

// Get payment history for due-based income
router.get("/due/history/:id", auth, getDuePaymentHistory);

// ==================== DIRECT INCOME ROUTES ====================

// Create direct income
router.post("/direct/create", auth, createDirectIncome);

// Get all direct income
router.get("/direct", auth, getDirectIncome);

// Update direct income
router.put("/direct/:id", auth, updateDirectIncome);

// Delete direct income (soft delete)
router.delete("/direct/:id", auth, deleteDirectIncome);

// ==================== SUMMARY & DASHBOARD ROUTES ====================

// Get income summary
router.get("/summary", auth, getIncomeSummary);

// Update overdue status
router.post("/update-overdue", auth, updateOverdueStatus);

module.exports = router;
