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
    try {
        const { page = 1, limit = 10, search = "" } = req.query;
        const skip = (page - 1) * limit;

        const query = {
            tenant_id: req.user.tenant_id,
        };

        if (search) {
            query.$or = [
                { householder_name: { $regex: search, $options: "i" } },
                { house_code: { $regex: search, $options: "i" } },
            ];
        }

        const houses = await House.find(query)
            .populate("family_id", "family_name family_code")
            .sort({ createdAt: -1 })
            .skip(Number(skip))
            .limit(Number(limit));

        const total = await House.countDocuments(query);

        res.json({
            houses,
            total,
            page: Number(page),
            pages: Math.ceil(total / limit),
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

exports.getHouseById = async (req, res) => {
    const house = await House.findOne({
        _id: req.params.id,
        tenant_id: req.user.tenant_id,
    }).populate("family_id");

    res.json(house);
};