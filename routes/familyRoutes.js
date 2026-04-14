const router = require("express").Router();
const auth = require("../middleware/auth");
const {
    createFamily,
    getFamilies,
    getFamilyById,
    updateFamily,
} = require("../controllers/familyController");

router.post("/create", auth, createFamily);
router.get("/", auth, getFamilies);
router.get("/:id", auth, getFamilyById);
router.put("/:id", auth, updateFamily);

module.exports = router;