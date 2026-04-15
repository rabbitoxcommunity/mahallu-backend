const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const dotenv = require("dotenv");
const User = require("./models/User");
const Tenant = require("./models/Tenant");

dotenv.config();

const seedTestData = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("MongoDB connected");

        // Find existing tenant or create a new one
        let tenant = await Tenant.findOne({ slug: "test-tenant" });
        if (!tenant) {
            // Try to find any existing tenant first
            tenant = await Tenant.findOne();
            if (!tenant) {
                // Create new tenant with the old schema structure for compatibility
                const tenantData = {
                    name: "Test Mahallu",
                    slug: "test-tenant",
                    status: "active"
                };
                
                // Try to save with new schema first
                try {
                    tenant = new Tenant(tenantData);
                    await tenant.save();
                    console.log("Test tenant created with new schema");
                } catch (error) {
                    // If that fails, create with old schema structure
                    console.log("New schema failed, trying with code field...");
                    tenantData.code = "TEST";
                    tenantData.is_active = true; // Old field name
                    
                    // Direct MongoDB insert for compatibility
                    await mongoose.connection.db.collection('tenants').insertOne(tenantData);
                    tenant = await Tenant.findOne({ slug: "test-tenant" });
                    console.log("Test tenant created with old schema compatibility");
                }
            } else {
                console.log("Using existing tenant:", tenant.slug || tenant.code);
            }
        }

        // Create a test superAdmin for the tenant
        let superAdmin = await User.findOne({ email: "superadmin@test.com" });
        if (!superAdmin) {
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash("password123", salt);

            superAdmin = new User({
                tenant_id: tenant._id,
                name: "Test Super Admin",
                email: "superadmin@test.com",
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
            console.log("Test superAdmin created");
        }

        console.log("\n=== Test Credentials ===");
        console.log("SuperAdmin Email: superadmin@test.com");
        console.log("SuperAdmin Password: password123");
        console.log("Tenant Slug: test-tenant");
        console.log("========================\n");

        process.exit(0);
    } catch (err) {
        console.error("Error creating test data:", err);
        process.exit(1);
    }
};

seedTestData();
