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
    try {
        const { page = 1, limit = 10, search = "" } = req.query;
        const skip = (page - 1) * limit;

        const query = {
            tenant_id: req.user.tenant_id,
        };

        if (search) {
            query.$or = [
                { family_name: { $regex: search, $options: "i" } },
                { family_code: { $regex: search, $options: "i" } },
            ];
        }

        const families = await Family.find(query)
            .sort({ createdAt: -1 })
            .skip(Number(skip))
            .limit(Number(limit));

        const total = await Family.countDocuments(query);

        res.json({
            families,
            total,
            page: Number(page),
            pages: Math.ceil(total / limit),
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

exports.getFamilyById = async (req, res) => {
    try {
        const family = await Family.findOne({
            _id: req.params.id,
            tenant_id: req.user.tenant_id,
        });

        if (!family) {
            return res.status(404).json({ message: "Family not found" });
        }

        res.json(family);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

exports.updateFamily = async (req, res) => {
    try {
        const family = await Family.findOneAndUpdate(
            { _id: req.params.id, tenant_id: req.user.tenant_id },
            { $set: req.body },
            { new: true }
        );

        if (!family) {
            return res.status(404).json({ message: "Family not found" });
        }

        res.json(family);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};