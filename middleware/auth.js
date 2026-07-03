const jwt = require("jsonwebtoken");
const User = require("../models/User");

module.exports = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(" ")[1];

        if (!token) {
            return res.status(401).json({
                message: "Unauthorized",
            });
        }

        const decoded = jwt.verify(
            token,
            process.env.JWT_SECRET
        );

        const user = await User.findById(decoded.id).select("is_active");

        if (!user || !user.is_active) {
            return res.status(401).json({
                message: "Account is deactivated",
            });
        }

        req.user = decoded;

        next();
    } catch (err) {
        return res.status(401).json({
            message: "Invalid token",
        });
    }
};