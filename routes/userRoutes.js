const router = require("express").Router();
const auth = require("../middleware/auth");
const role = require("../middleware/role");
const {
    createUser,
    getTenantUsers,
    updateUserPermissions,
    updateUserStatus,
    getUser,
    updateUserRole
} = require("../controllers/userController");

// Create tenant user - superAdmin or platformAdmin only
router.post("/create", auth, role("superAdmin", "platformAdmin"), createUser);

// Get all users of current tenant - authenticated users only
router.get("/", auth, getTenantUsers);

// Get single user details - authenticated users only
router.get("/:id", auth, getUser);

// Update user permissions - superAdmin or platformAdmin only
router.patch("/:id/permissions", auth, role("superAdmin", "platformAdmin"), updateUserPermissions);

// Update user status (activate/deactivate) - superAdmin or platformAdmin only
router.patch("/:id/status", auth, role("superAdmin", "platformAdmin"), updateUserStatus);

// Update user role - superAdmin or platformAdmin only
router.patch("/:id/role", auth, role("superAdmin", "platformAdmin"), updateUserRole);

module.exports = router;
