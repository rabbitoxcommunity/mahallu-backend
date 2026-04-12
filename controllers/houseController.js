const House = require("../models/House");

exports.createHouse = async (req, res) => {
    try {
        const count = await House.countDocuments({
            tenant_id: req.user.tenant_id,
        });

        const houseCode = `HSE-${String(count + 1).padStart(3, "0")}`;

        const house = await House.create({
            ...req.body,
            tenant_id: req.user.tenant_id,
            house_code: houseCode,
        });

        res.status(201).json(house);

    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

exports.getHouses = async (req, res) => {
    const houses = await House.find({
        tenant_id: req.user.tenant_id,
        is_active: true,
    }).populate("family_id", "family_name family_code");

    res.json(houses);
};

exports.getHouseById = async (req, res) => {
    const house = await House.findOne({
        _id: req.params.id,
        tenant_id: req.user.tenant_id,
    }).populate("family_id");

    res.json(house);
};