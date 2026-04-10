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
            email: "user@mail.com",
            password: "12345678",
            role: "user",
            // tenant_id: new mongoose.Types.ObjectId() // Optional
        };

        // Check if user already exists
        const existingUser = await User.findOne({ email: userData.email });
        if (existingUser) {
            console.log("User already exists");
            process.exit(0);
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(userData.password, salt);

        // Create user
        const newUser = new User({
            ...userData,
            password: hashedPassword
        });

        await newUser.save();
        console.log("User created successfully:");
        console.log(`Email: ${userData.email}`);
        console.log(`Password: ${userData.password}`);

        process.exit(0);
    } catch (err) {
        console.error("Error creating user:", err);
        process.exit(1);
    }
};

seedUser();
