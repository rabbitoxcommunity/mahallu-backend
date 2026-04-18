const User = require("../models/User");
const bcrypt = require("bcryptjs");

// Create tenant staff (admin only)
exports.createUser = async (req, res) => {
    try {
        const { name, email, password, role, permissions } = req.body;

        // Validate role - only admin role allowed for staff creation
        if (role !== "admin") {
            return res.status(400).json({
                message: "Invalid role. Only 'admin' role allowed for staff creation"
            });
        }

        // Check if email already exists in the same tenant
        const existingUser = await User.findOne({ 
            email, 
            tenant_id: req.user.tenant_id 
        });
        
        if (existingUser) {
            return res.status(400).json({
                message: "Email already exists in this tenant"
            });
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Set default permissions if not provided
        const defaultPermissions = {
            family: false,
            dashboard: false,
            finance: false,
            ...permissions
        };

        // Create user with forced tenant_id
        const user = new User({
            tenant_id: req.user.tenant_id, // Force tenant_id from authenticated user
            name,
            email,
            password: hashedPassword,
            role,
            permissions: defaultPermissions
        });

        await user.save();

        res.status(201).json({
            message: "User created successfully",
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                permissions: user.permissions,
                is_active: user.is_active,
                createdAt: user.createdAt
            }
        });
    } catch (error) {
        console.error("Create user error:", error);
        res.status(500).json({
            message: "Internal server error"
        });
    }
};

// Get all staff of current tenant (excluding platformAdmin)
exports.getTenantUsers = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;
        const search = req.query.search || "";

        // Build query
        let query = { tenant_id: req.user.tenant_id };
        
        // Include only staff roles (superAdmin and admin)
        query.role = { $in: ["superAdmin", "admin"] };
        
        // Add search functionality
        if (search) {
            query.$or = [
                { name: { $regex: search, $options: "i" } },
                { email: { $regex: search, $options: "i" } }
            ];
        }

        const users = await User.find(query)
            .select("-password")
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

        const total = await User.countDocuments(query);

        res.json({
            users,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error("Get tenant users error:", error);
        res.status(500).json({
            message: "Internal server error"
        });
    }
};

// Update user permissions
exports.updateUserPermissions = async (req, res) => {
    try {
        const { id } = req.params;
        const { permissions } = req.body;

        // Find user and ensure it belongs to the same tenant
        const user = await User.findOne({ 
            _id: id, 
            tenant_id: req.user.tenant_id 
        });

        if (!user) {
            return res.status(404).json({
                message: "User not found or access denied"
            });
        }

        // Prevent modifying platformAdmin or superAdmin permissions
        if (user.role === "superAdmin") {
            return res.status(403).json({
                message: "Cannot modify superAdmin permissions"
            });
        }

        // Update permissions
        user.permissions = {
            family: permissions.family || false,
            dashboard: permissions.dashboard || false,
            finance: permissions.finance || false
        };

        await user.save();

        res.json({
            message: "User permissions updated successfully",
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                permissions: user.permissions,
                updatedAt: user.updatedAt
            }
        });
    } catch (error) {
        console.error("Update user permissions error:", error);
        res.status(500).json({
            message: "Internal server error"
        });
    }
};

// Activate/Deactivate user
exports.updateUserStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { is_active } = req.body;

        // Find user and ensure it belongs to the same tenant
        const user = await User.findOne({ 
            _id: id, 
            tenant_id: req.user.tenant_id 
        });

        if (!user) {
            return res.status(404).json({
                message: "User not found or access denied"
            });
        }

        // Prevent deactivating superAdmin
        if (user.role === "superAdmin") {
            return res.status(403).json({
                message: "Cannot deactivate superAdmin"
            });
        }

        // Prevent self-deactivation
        if (user._id.toString() === req.user.id) {
            return res.status(403).json({
                message: "Cannot deactivate your own account"
            });
        }

        user.is_active = is_active;
        await user.save();

        res.json({
            message: `User ${is_active ? 'activated' : 'deactivated'} successfully`,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                is_active: user.is_active,
                updatedAt: user.updatedAt
            }
        });
    } catch (error) {
        console.error("Update user status error:", error);
        res.status(500).json({
            message: "Internal server error"
        });
    }
};

// Get current user details
exports.getCurrentUser = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select("-password");

        if (!user) {
            return res.status(404).json({
                message: "User not found"
            });
        }

        res.json({
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                tenant_id: user.tenant_id,
                permissions: user.permissions,
                is_active: user.is_active,
                createdAt: user.createdAt,
                updatedAt: user.updatedAt
            }
        });
    } catch (error) {
        console.error("Get current user error:", error);
        res.status(500).json({
            message: "Internal server error"
        });
    }
};

// Get single user details
exports.getUser = async (req, res) => {
    try {
        const { id } = req.params;

        const user = await User.findOne({ 
            _id: id, 
            tenant_id: req.user.tenant_id 
        }).select("-password");

        if (!user) {
            return res.status(404).json({
                message: "User not found or access denied"
            });
        }

        res.json({
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                permissions: user.permissions,
                is_active: user.is_active,
                createdAt: user.createdAt,
                updatedAt: user.updatedAt
            }
        });
    } catch (error) {
        console.error("Get user error:", error);
        res.status(500).json({
            message: "Internal server error"
        });
    }
};

// Update user role (admin only for staff management)
exports.updateUserRole = async (req, res) => {
    try {
        const { id } = req.params;
        const { role } = req.body;

        // Validate role - only admin role allowed for staff management
        if (role !== "admin") {
            return res.status(400).json({
                message: "Invalid role. Only 'admin' role allowed for staff management"
            });
        }

        // Find user and ensure it belongs to the same tenant
        const user = await User.findOne({ 
            _id: id, 
            tenant_id: req.user.tenant_id 
        });

        if (!user) {
            return res.status(404).json({
                message: "User not found or access denied"
            });
        }

        // Prevent modifying superAdmin role
        if (user.role === "superAdmin") {
            return res.status(403).json({
                message: "Cannot modify superAdmin role"
            });
        }

        // Prevent self-role modification
        if (user._id.toString() === req.user.id) {
            return res.status(403).json({
                message: "Cannot modify your own role"
            });
        }

        user.role = role;
        await user.save();

        res.json({
            message: "User role updated successfully",
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                updatedAt: user.updatedAt
            }
        });
    } catch (error) {
        console.error("Update user role error:", error);
        res.status(500).json({
            message: "Internal server error"
        });
    }
};
