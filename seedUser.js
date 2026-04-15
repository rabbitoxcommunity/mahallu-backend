const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const dotenv = require("dotenv");
const User = require("./models/User");

dotenv.config();

const seedUser = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("MongoDB connected");

        // Define platform admin data here
        const userData = {
            name: "Platform Admin",
            email: "platformadmin@mail.com",
            password: "12345678",
            role: "platformAdmin",
            // tenant_id: null for platform admin
        };

        // Check if platform admin already exists
        const existingUser = await User.findOne({ email: userData.email });
        if (existingUser) {
            console.log("Platform admin already exists");
            process.exit(0);
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(userData.password, salt);

        // Create platform admin user (no tenant_id)
        const newUser = new User({
            ...userData,
            password: hashedPassword
        });

        await newUser.save();
        console.log("Platform admin created successfully:");
        console.log(`Email: ${userData.email}`);
        console.log(`Password: ${userData.password}`);
        console.log(`Role: ${userData.role}`);

        process.exit(0);
    } catch (err) {
        console.error("Error creating user:", err);
        process.exit(1);
    }
};

seedUser();
