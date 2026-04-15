const router = require("express").Router();
const auth = require("../middleware/auth");
const {
    createFamily,
    getFamilies,
    getFamilyById,
    updateFamily,
} = require("../controllers/familyController");
const permitModule = require("../middleware/permitModule");

router.post("/create", auth, permitModule("family"), createFamily);
router.get("/", auth, getFamilies);
router.get("/:id", auth, getFamilyById);
router.put("/:id", auth, updateFamily);

module.exports = router;