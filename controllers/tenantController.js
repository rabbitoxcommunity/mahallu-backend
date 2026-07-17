const Tenant = require("../models/Tenant");
const User = require("../models/User");
const bcrypt = require("bcryptjs");
const path = require("path");
const { uploadToR2, deleteFromR2ByUrl, streamFromR2ByUrl } = require("../utils/r2Client");

// Uploads a signature image to R2 under a tenant-scoped folder and returns the public URL.
const uploadSignature = async (tenantSlug, file) => {
    const ext = path.extname(file.originalname) || "";
    const key = `signatures/${tenantSlug}/signatory${ext}`;
    return uploadToR2(key, file.buffer, { contentType: file.mimetype });
};

// Create tenant and auto-create super admin
exports.createTenant = async (req, res) => {
    try {
        console.log('=== Tenant Creation Request ===');
        console.log('Request body:', req.body);
        
        const { name, nameMalayalam, address, addressMalayalam, regNo, slug, superAdminName, superAdminEmail, password } = req.body;

        console.log('Extracted data:', { name, nameMalayalam, address, addressMalayalam, regNo, slug, superAdminName, superAdminEmail, password: '***' });

        // Check if tenant slug already exists
        console.log('Checking for existing tenant with slug:', slug);
        const existingTenant = await Tenant.findOne({ slug });
        if (existingTenant) {
            console.log('Tenant already exists:', existingTenant.slug);
            return res.status(400).json({
                message: "Tenant slug already exists"
            });
        }

        // Check if super admin email already exists in any tenant
        console.log('Checking for existing user with email:', superAdminEmail);
        const existingUserWithEmail = await User.findOne({ email: superAdminEmail });
        if (existingUserWithEmail) {
            console.log('User with this email already exists:', existingUserWithEmail.email, 'in tenant:', existingUserWithEmail.tenant_id);
            return res.status(400).json({
                message: "This email is already registered. Please use a different email address."
            });
        }

        // Create tenant
        console.log('Creating tenant with data:', { name, slug });

        // Generate a unique code from the slug (uppercase, max 10 chars)
        const baseCode = slug.replace(/-/g, '').toUpperCase().substring(0, 10);
        let code = baseCode;
        let codeSuffix = 1;
        while (await Tenant.findOne({ code })) {
            code = `${baseCode.substring(0, 8)}${codeSuffix++}`;
        }
        console.log('Generated unique tenant code:', code);
        
        const tenant = new Tenant({
            name,
            nameMalayalam,
            address,
            addressMalayalam,
            regNo,
            slug,
            code
        });
        
        await tenant.save();
        console.log('Tenant created successfully:', tenant._id);

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Create super admin user
        console.log('Creating super admin user with data:', { superAdminName, superAdminEmail });
        const superAdmin = new User({
            tenant_id: tenant._id,
            name: superAdminName,
            email: superAdminEmail,
            password: hashedPassword,
            role: "superAdmin",
            permissions: {
                family: true,
                dashboard: true,
                finance: true
            }
        });

        try {
            await superAdmin.save();
            console.log('Super admin user created successfully:', superAdmin._id);
        } catch (userError) {
            // If user creation fails, delete the tenant we just created
            console.error('Failed to create super admin, cleaning up tenant:', tenant._id);
            await Tenant.findByIdAndDelete(tenant._id);
            
            // Re-throw the error to be handled by the main catch block
            throw userError;
        }

        res.status(201).json({
            message: "Tenant created successfully",
            tenant: {
                id: tenant._id,
                name: tenant.name,
                nameMalayalam: tenant.nameMalayalam,
                address: tenant.address,
                addressMalayalam: tenant.addressMalayalam,
                regNo: tenant.regNo,
                slug: tenant.slug,
                code: tenant.code,
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
        console.error("Error details:", error.message);
        console.error("Error code:", error.code);
        
        // Handle MongoDB duplicate key error
        if (error.code === 11000) {
            console.log('Duplicate key error details:', {
                keyPattern: error.keyPattern,
                keyValue: error.keyValue
            });
            
            if (error.keyPattern && error.keyPattern.slug) {
                return res.status(400).json({
                    message: "Tenant slug already exists"
                });
            } else if (error.keyPattern && error.keyPattern.code) {
                // Should be extremely rare now since we pre-check, but just in case
                return res.status(500).json({
                    message: "Failed to generate a unique tenant code. Please try again.",
                    error: "DUPLICATE_CODE_ERROR"
                });
            } else if (error.keyPattern && error.keyPattern.email && error.keyPattern.tenant_id) {
                return res.status(400).json({
                    message: "This email is already in use within this tenant"
                });
            } else if (error.keyPattern && error.keyPattern.email) {
                return res.status(400).json({
                    message: "This email is already registered"
                });
            } else {
                return res.status(500).json({
                    message: "Duplicate key error occurred. Please try again.",
                    error: "DUPLICATE_KEY_ERROR",
                    details: error.keyPattern
                });
            }
        } else {
            res.status(500).json({
                message: "Internal server error",
                error: error.message
            });
        }
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
                nameMalayalam: tenant.nameMalayalam,
                address: tenant.address,
                addressMalayalam: tenant.addressMalayalam,
                regNo: tenant.regNo,
                signatoryName: tenant.signatoryName,
                signatoryTitle: tenant.signatoryTitle,
                signatorySignature: tenant.signatorySignature,
                slug: tenant.slug,
                code: tenant.code,
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

// Update tenant details (name, Malayalam name, address, registration number, signatory)
exports.updateTenant = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, nameMalayalam, address, addressMalayalam, regNo, signatoryName, signatoryTitle } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({
                message: "Tenant name is required"
            });
        }

        const existing = await Tenant.findById(id).select("slug signatorySignature");
        if (!existing) {
            return res.status(404).json({
                message: "Tenant not found"
            });
        }

        const update = { name, nameMalayalam, address, addressMalayalam, regNo, signatoryName, signatoryTitle };

        const signatureFile = req.file;
        if (signatureFile) {
            const newSignatureUrl = await uploadSignature(existing.slug, signatureFile);
            // The upload key is deterministic (same slug -> same key), so a same-extension
            // re-upload already overwrote the old object in place. Only delete the old object
            // when the extension changed and it therefore lives under a different key -
            // otherwise this would delete the file we just uploaded.
            if (existing.signatorySignature && existing.signatorySignature !== newSignatureUrl) {
                await deleteFromR2ByUrl(existing.signatorySignature);
            }
            update.signatorySignature = newSignatureUrl;
        }

        const tenant = await Tenant.findByIdAndUpdate(
            id,
            update,
            { new: true, runValidators: true }
        );

        res.json({
            message: "Tenant updated successfully",
            tenant: {
                id: tenant._id,
                name: tenant.name,
                nameMalayalam: tenant.nameMalayalam,
                address: tenant.address,
                addressMalayalam: tenant.addressMalayalam,
                regNo: tenant.regNo,
                signatoryName: tenant.signatoryName,
                signatoryTitle: tenant.signatoryTitle,
                signatorySignature: tenant.signatorySignature,
                slug: tenant.slug,
                code: tenant.code,
                status: tenant.status,
                updatedAt: tenant.updatedAt
            }
        });
    } catch (error) {
        console.error("Update tenant error:", error);
        res.status(500).json({
            message: "Internal server error"
        });
    }
};

// Get the requesting user's own tenant org info
exports.getMyTenant = async (req, res) => {
    try {
        const tenant = await Tenant.findById(req.user.tenant_id)
            .select('name nameMalayalam address addressMalayalam regNo');
        if (!tenant) {
            return res.status(404).json({ message: "Tenant not found" });
        }
        res.json({ tenant });
    } catch (error) {
        console.error("Get my tenant error:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// Update the requesting user's own tenant's Malayalam name/address/regNo (superAdmin only)
exports.updateMyTenant = async (req, res) => {
    try {
        if (req.user.role !== 'superAdmin') {
            return res.status(403).json({ message: "Only super admin can update organization info" });
        }
        const { nameMalayalam, addressMalayalam, regNo } = req.body;
        const tenant = await Tenant.findByIdAndUpdate(
            req.user.tenant_id,
            { nameMalayalam, addressMalayalam, regNo },
            { new: true, runValidators: true }
        ).select('name nameMalayalam address addressMalayalam regNo');
        if (!tenant) {
            return res.status(404).json({ message: "Tenant not found" });
        }
        res.json({ message: "Organization info updated successfully", tenant });
    } catch (error) {
        console.error("Update my tenant error:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// Stream the requesting user's own tenant signature image
exports.viewSignature = async (req, res) => {
    try {
        const tenant = await Tenant.findById(req.user.tenant_id).select("signatorySignature");
        if (!tenant) {
            return res.status(404).json({ message: "Tenant not found" });
        }

        if (!tenant.signatorySignature) {
            return res.status(404).json({ message: "Signature not set" });
        }

        const obj = await streamFromR2ByUrl(tenant.signatorySignature);
        if (!obj) {
            return res.status(404).json({ message: "Signature not found" });
        }

        res.setHeader("Content-Type", obj.contentType || "image/png");
        if (obj.contentLength) res.setHeader("Content-Length", obj.contentLength);
        obj.body.pipe(res);
    } catch (error) {
        console.error("View signature error:", error);
        res.status(500).json({
            message: "Internal server error"
        });
    }
};