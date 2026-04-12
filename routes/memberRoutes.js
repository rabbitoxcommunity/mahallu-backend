const router = require("express").Router();
const auth = require("../middleware/auth");
const {
    addMember,
    getMembersByHouse,
} = require("../controllers/memberController");

router.post("/add", auth, addMember);
router.get("/house/:houseId", auth, getMembersByHouse);

module.exports = router;