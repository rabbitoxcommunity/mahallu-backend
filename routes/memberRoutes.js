const router = require("express").Router();
const auth = require("../middleware/auth");
const {
    addMember,
    getMembersByHouse,
    getAllMembers,
    getMemberById,
    updateMember,
} = require("../controllers/memberController");

router.post("/add", auth, addMember);
router.get("/all", auth, getAllMembers);
router.get("/:id", auth, getMemberById);
router.put("/:id", auth, updateMember);
router.get("/house/:houseId", auth, getMembersByHouse);

module.exports = router;