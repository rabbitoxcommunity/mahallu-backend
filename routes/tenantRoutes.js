const router = require("express").Router();
const multer = require("multer");
const auth = require("../middleware/auth");
const role = require("../middleware/role");
const {
    createTenant,
    getTenants,
    updateTenantStatus,
    getTenant,
    updateTenant,
    viewSignature,
    getMyTenant,
    updateMyTenant
} = require("../controllers/tenantController");

const upload = multer({ storage: multer.memoryStorage() });
const uploadSignature = upload.single("signatorySignature");

// Create tenant - Platform Admin only
router.post("/create", auth, role("platformAdmin"), createTenant);

// Get all tenants with pagination - Platform Admin only
router.get("/", auth, role("platformAdmin"), getTenants);

// Stream the current user's own tenant signatory's signature image - any authenticated user
router.get("/signature", auth, viewSignature);

// Get / update current user's own tenant org info (for General Settings page)
router.get("/my-org", auth, getMyTenant);
router.patch("/my-org", auth, updateMyTenant);

// Get single tenant details - Platform Admin only
router.get("/:id", auth, role("platformAdmin"), getTenant);

// Update tenant status - Platform Admin only
router.patch("/:id/status", auth, role("platformAdmin"), updateTenantStatus);

// Update tenant details - Platform Admin only
router.put("/:id", auth, role("platformAdmin"), uploadSignature, updateTenant);

module.exports = router;
