const Tenant = require("../models/Tenant");
const User = require("../models/User");
const bcrypt = require("bcryptjs");

// Create tenant and auto-create super admin
exports.createTenant = async (req, res) => {
    try {
        const { name, slug, superAdminName, superAdminEmail, password } = req.body;

        // Check if tenant slug already exists
        const existingTenant = await Tenant.findOne({ slug });
        if (existingTenant) {
            return res.status(400).json({
                message: "Tenant slug already exists"
            });
        }

        // Check if super admin email already exists
        const existingUser = await User.findOne({ email: superAdminEmail });
        if (existingUser) {
            return res.status(400).json({
                message: "Super admin email already exists"
            });
        }

        // Create tenant
        const tenant = new Tenant({
            name,
            slug
        });

        await tenant.save();

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Create super admin user
        const superAdmin = new User({
            tenant_id: tenant._id,
            name: superAdminName,
            email: superAdminEmail,
            password: hashedPassword,
            role: "superAdmin",
            permissions: {
                family: true,
                payments: true,
                campaigns: true,
                reports: true,
                settings: true
            }
        });

        await superAdmin.save();

        res.status(201).json({
            message: "Tenant created successfully",
            tenant: {
                id: tenant._id,
                name: tenant.name,
                slug: tenant.slug,
                status: tenant.status,
                createdAt: tenant.createdAt
            },
            superAdmin: {
                id: superAdmin._id,
                name: superAdmin.name,
                email: superAdmin.email,
                role: superAdmin.role
            }
        });
    } catch (error) {
        console.error("Create tenant error:", error);
        res.status(500).json({
            message: "Internal server error"
        });
    }
};

// Get all tenants with pagination
exports.getTenants = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const tenants = await Tenant.find()
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

        const total = await Tenant.countDocuments();

        // Get super admin for each tenant
        const tenantsWithAdmins = await Promise.all(
            tenants.map(async (tenant) => {
                const superAdmin = await User.findOne({
                    tenant_id: tenant._id,
                    role: "superAdmin"
                }).select("name email createdAt").lean();

                return {
                    ...tenant,
                    superAdmin
                };
            })
        );

        res.json({
            tenants: tenantsWithAdmins,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error("Get tenants error:", error);
        res.status(500).json({
            message: "Internal server error"
        });
    }
};

// Update tenant status (suspend/activate)
exports.updateTenantStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        if (!["active", "suspended"].includes(status)) {
            return res.status(400).json({
                message: "Invalid status"
            });
        }

        const tenant = await Tenant.findByIdAndUpdate(
            id,
            { status },
            { new: true }
        );

        if (!tenant) {
            return res.status(404).json({
                message: "Tenant not found"
            });
        }

        res.json({
            message: `Tenant ${status} successfully`,
            tenant: {
                id: tenant._id,
                name: tenant.name,
                slug: tenant.slug,
                status: tenant.status,
                updatedAt: tenant.updatedAt
            }
        });
    } catch (error) {
        console.error("Update tenant status error:", error);
        res.status(500).json({
            message: "Internal server error"
        });
    }
};

// Get single tenant details
exports.getTenant = async (req, res) => {
    try {
        const { id } = req.params;

        const tenant = await Tenant.findById(id);
        if (!tenant) {
            return res.status(404).json({
                message: "Tenant not found"
            });
        }

        const superAdmin = await User.findOne({
            tenant_id: tenant._id,
            role: "superAdmin"
        }).select("name email createdAt permissions");

        res.json({
            tenant: {
                id: tenant._id,
                name: tenant.name,
                slug: tenant.slug,
                status: tenant.status,
                createdAt: tenant.createdAt,
                updatedAt: tenant.updatedAt
            },
            superAdmin
        });
    } catch (error) {
        console.error("Get tenant error:", error);
        res.status(500).json({
            message: "Internal server error"
        });
    }
};