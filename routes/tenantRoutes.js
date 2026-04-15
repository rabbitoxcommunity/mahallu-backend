const router = require("express").Router();
const auth = require("../middleware/auth");
const role = require("../middleware/role");
const {
    createTenant,
    getTenants,
    updateTenantStatus,
    getTenant
} = require("../controllers/tenantController");

// Create tenant - Platform Admin only
router.post("/create", auth, role("platformAdmin"), createTenant);

// Get all tenants with pagination - Platform Admin only
router.get("/", auth, role("platformAdmin"), getTenants);

// Get single tenant details - Platform Admin only
router.get("/:id", auth, role("platformAdmin"), getTenant);

// Update tenant status - Platform Admin only
router.patch("/:id/status", auth, role("platformAdmin"), updateTenantStatus);

module.exports = router;