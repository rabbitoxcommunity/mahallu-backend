const Family = require("../models/Family");

exports.createFamily = async (req, res) => {
    try {
        const count = await Family.countDocuments({
            tenant_id: req.user.tenant_id,
        });

        const familyCode = `MHL-${String(count + 1).padStart(3, "0")}`;

        const family = await Family.create({
            ...req.body,
            tenant_id: req.user.tenant_id,
            family_code: familyCode,
        });

        res.status(201).json(family);

    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

exports.getFamilies = async (req, res) => {
    const families = await Family.find({
        tenant_id: req.user.tenant_id,
        is_active: true,
    });

    res.json(families);
};