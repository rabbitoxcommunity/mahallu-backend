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

exports.getMembersByHouse = async (req, res) => {
    const members = await Member.find({
        house_id: req.params.houseId,
        tenant_id: req.user.tenant_id,
        is_active: true,
    });

    res.json(members);
};