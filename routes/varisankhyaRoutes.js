const router = require("express").Router();
const auth = require("../middleware/auth");
const {
    generateMonthlyDues,
    getMonthlyVarisankhya,
    markPayment,
    getDefaulters,
    getHousePaymentHistory,
    getPaymentHistory,
    getDefaulterHistory,
} = require("../controllers/varisankhyaController");

// Generate monthly dues for all active houses
router.post("/generate", auth, generateMonthlyDues);

// Get monthly varisankhya list (with month/year query params)
router.get("/", auth, getMonthlyVarisankhya);

// Get payment history (all payments)
router.get("/payment-history", auth, getPaymentHistory);

// Get defaulters list
router.get("/defaulters", auth, getDefaulters);

// Get house payment history
router.get("/house/:houseId", auth, getHousePaymentHistory);

// Get defaulter history for a house
router.get("/defaulter/:houseId", auth, getDefaulterHistory);

// Mark payment for a varisankhya record
router.put("/pay/:id", auth, markPayment);

module.exports = router;
