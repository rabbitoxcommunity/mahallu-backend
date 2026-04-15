const Family = require("../models/Family");
const generateSequence = require("../utils/generateSequence");

exports.createFamily = async (req, res) => {
    try {
        const existingFamily = await Family.findOne({
            tenant_id: req.user.tenant_id,
            family_name: req.body.family_name,
        });

        if (existingFamily) {
            return res.status(400).json({
                success: false,
                message: "Family already exists",
            });
        }

        const family_code = await generateSequence(
            req.user.tenant_id,
            "family"
        );

        const family = await Family.create({
            tenant_id: req.user.tenant_id,
            family_name: req.body.family_name,
            notes: req.body.notes,
            family_code,
        });

        res.status(201).json({
            success: true,
            data: family,
        });

    } catch (err) {
        res.status(500).json({
            message: err.message,
        });
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