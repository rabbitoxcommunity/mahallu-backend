const router = require("express").Router();
const auth = require("../middleware/auth");
const {
    addMember,
    getMembersByHouse,
    getAllMembers,
} = require("../controllers/memberController");

router.post("/add", auth, addMember);
router.get("/all", auth, getAllMembers);
router.get("/house/:houseId", auth, getMembersByHouse);

module.exports = router;