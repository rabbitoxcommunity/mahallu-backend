const router = require("express").Router();
const auth = require("../middleware/auth");
const {
    createHouse,
    getHouses,
    getHouseById,
    updateHouse,
} = require("../controllers/houseController");

router.post("/create", auth, createHouse);
router.get("/", auth, getHouses);
router.get("/:id", auth, getHouseById);
router.put("/:id", auth, updateHouse);

module.exports = router;