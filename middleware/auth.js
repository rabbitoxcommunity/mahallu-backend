const jwt = require("jsonwebtoken");

module.exports = async (req, res, next) => {
    // Get token from header
    const authHeader = req.header("Authorization");
    const token = authHeader && authHeader.split(" ")[1];

    // Check if no token
    if (!token) {
        return res.status(401).json({ msg: "No token, authorization denied" });
    }

    // Verify token
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;

        // Fallback: If tenant_id is missing from token (e.g. old token), fetch from DB
        if (!req.user.tenant_id) {
            const User = require("../models/User");
            const user = await User.findById(req.user.id);
            if (user && user.tenant_id) {
                req.user.tenant_id = user.tenant_id;
            }
        }

        next();
    } catch (err) {
        res.status(401).json({ msg: "Token is not valid" });
    }
};