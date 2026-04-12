const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const dotenv = require("dotenv");
const User = require("./models/User");

dotenv.config();

const seedUser = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("MongoDB connected");

        // Define user data here
        const userData = {
            name: "Admin User",
            email: "superadmin@mail.com",
            password: "12345678",
            role: "superAdmin",
            // tenant_id: new mongoose.Types.ObjectId() // Optional
        };

        // Ensure a default tenant exists
        const Tenant = require("./models/Tenant");
        let tenant = await Tenant.findOne({ code: "DFLT" });
        if (!tenant) {
            tenant = await Tenant.create({
                name: "Default Mahallu",
                code: "DFLT"
            });
            console.log("Default tenant created");
        }

        // Check if user already exists
        const existingUser = await User.findOne({ email: userData.email });
        if (existingUser) {
            // Update existing user with tenant_id if missing
            if (!existingUser.tenant_id) {
                existingUser.tenant_id = tenant._id;
                await existingUser.save();
                console.log("Updated existing user with default tenant_id");
            } else {
                console.log("User already exists with tenant_id");
            }
            process.exit(0);
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(userData.password, salt);

        // Create user
        const newUser = new User({
            ...userData,
            password: hashedPassword,
            tenant_id: tenant._id
        });

        await newUser.save();
        console.log("User created successfully:");
        console.log(`Email: ${userData.email}`);
        console.log(`Password: ${userData.password}`);
        console.log(`Tenant ID: ${tenant._id}`);

        process.exit(0);
    } catch (err) {
        console.error("Error creating user:", err);
        process.exit(1);
    }
};

seedUser();
