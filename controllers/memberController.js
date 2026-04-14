const Member = require("../models/Member");

exports.addMember = async (req, res) => {
    try {
        const member = await Member.create({
            ...req.body,
            tenant_id: req.user.tenant_id,
        });

        res.status(201).json(member);

    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

exports.getAllMembers = async (req, res) => {
    try {
        const { page = 1, limit = 10, search = "", blood_group = "" } = req.query;
        const skip = (page - 1) * limit;

        const query = {
            tenant_id: req.user.tenant_id,
        };

        if (search) {
            query.$or = [
                { full_name: { $regex: search, $options: "i" } },
                { whatsapp: { $regex: search, $options: "i" } },
                { blood_group: { $regex: search, $options: "i" } },
            ];
        }

        if (blood_group) {
            query.blood_group = blood_group;
        }

        const members = await Member.find(query)
            .populate("house_id", "house_code householder_name")
            .sort({ full_name: 1 })
            .skip(Number(skip))
            .limit(Number(limit));

        const total = await Member.countDocuments(query);

        res.json({
            members,
            total,
            page: Number(page),
            limit: Number(limit),
            pages: Math.ceil(total / limit),
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

exports.getMembersByHouse = async (req, res) => {
    try {
        const { page = 1, limit = 10, search = "" } = req.query;
        const skip = (page - 1) * limit;

        const query = {
            house_id: req.params.houseId,
            tenant_id: req.user.tenant_id,
        };

        if (search) {
            query.full_name = { $regex: search, $options: "i" };
        }

        const members = await Member.find(query)
            .sort({ is_family_head: -1, createdAt: 1 })
            .skip(Number(skip))
            .limit(Number(limit));

        const total = await Member.countDocuments(query);

        res.json({
            members,
            total,
            page: Number(page),
            pages: Math.ceil(total / limit),
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

exports.getMemberById = async (req, res) => {
    try {
        const member = await Member.findOne({
            _id: req.params.id,
            tenant_id: req.user.tenant_id,
        }).populate("house_id");

        if (!member) {
            return res.status(404).json({ message: "Member not found" });
        }

        res.json(member);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

exports.updateMember = async (req, res) => {
    try {
        const member = await Member.findOneAndUpdate(
            { _id: req.params.id, tenant_id: req.user.tenant_id },
            { $set: req.body },
            { new: true }
        ).populate("house_id");

        if (!member) {
            return res.status(404).json({ message: "Member not found" });
        }

        res.json(member);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};