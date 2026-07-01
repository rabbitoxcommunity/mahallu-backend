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
    getTemplateEntries,
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

router.post("/due/create",             auth, createDueIncome);
router.get("/due",                     auth, getDueIncome);
router.get("/due/:id/entries",         auth, getTemplateEntries);   // all monthly entries for a template
router.put("/due/:id",                 auth, updateDueIncome);
router.delete("/due/:id",              auth, deleteDueIncome);
router.put("/due/pay/:id",             auth, markDuePayment);       // id = entry._id
router.get("/due/history/:id",         auth, getDuePaymentHistory); // id = entry._id

// ==================== DIRECT INCOME ROUTES ====================

router.post("/direct/create",  auth, createDirectIncome);
router.get("/direct",          auth, getDirectIncome);
router.put("/direct/:id",      auth, updateDirectIncome);
router.delete("/direct/:id",   auth, deleteDirectIncome);

// ==================== SUMMARY & DASHBOARD ROUTES ====================

router.get("/summary",         auth, getIncomeSummary);
router.post("/update-overdue", auth, updateOverdueStatus);

module.exports = router;
