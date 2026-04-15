module.exports = (moduleName) => {
    return (req, res, next) => {
        const { role, permissions } = req.user;

        if (
            role === "platformAdmin" ||
            role === "superAdmin"
        ) {
            return next();
        }

        if (!permissions?.[moduleName]) {
            return res.status(403).json({
                message: `No access to ${moduleName} module`,
            });
        }

        next();
    };
};