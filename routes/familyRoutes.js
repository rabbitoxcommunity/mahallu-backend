const router = require("express").Router();
const Family = require("../models/Family");
const auth = require("../middleware/auth");

router.post("/add", auth, async (req, res) => {
    const family = new Family({
        ...req.body,
        tenant_id: req.user.tenant_id
    });

    await family.save();
    res.json(family);
});

router.get("/", auth, async (req, res) => {
    const families = await Family.find({ tenant_id: req.user.tenant_id });
    res.json(families);
});

module.exports = router;