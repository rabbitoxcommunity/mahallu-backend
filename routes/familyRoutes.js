const router = require("express").Router();
const auth = require("../middleware/auth");
const {
    createFamily,
    getFamilies,
} = require("../controllers/familyController");

router.post("/create", auth, createFamily);
router.get("/", auth, getFamilies);

module.exports = router;