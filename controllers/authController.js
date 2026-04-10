const User = require("../models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

exports.login = async (req, res) => {
    const user = await User.findOne({ email: req.body.email });

    if (!user) return res.status(400).json({ msg: "User not found" });

    const isMatch = await bcrypt.compare(req.body.password, user.password);

    if (!isMatch) return res.status(400).json({ msg: "Wrong password" });

    const token = jwt.sign(
        { id: user._id, role: user.role, tenant_id: user.tenant_id },
        process.env.JWT_SECRET
    );

    res.json({ token, user });
};