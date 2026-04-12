const router = require("express").Router();
const auth = require("../middleware/auth");
const {
    createHouse,
    getHouses,
    getHouseById,
} = require("../controllers/houseController");

router.post("/create", auth, createHouse);
router.get("/", auth, getHouses);
router.get("/:id", auth, getHouseById);

module.exports = router;