const mongoose = require("mongoose");

const TenantSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
        },
        nameMalayalam: {
            type: String,
            trim: true,
            default: "",
        },
        address: {
            type: String,
            trim: true,
            default: "",
        },
        addressMalayalam: {
            type: String,
            trim: true,
            default: "",
        },
        regNo: {
            type: String,
            trim: true,
            default: "",
        },
        signatoryName: {
            type: String,
            trim: true,
            default: "",
        },
        signatoryTitle: {
            type: String,
            enum: ["President", "Secretary"],
            default: "Secretary",
        },
        signatorySignature: {
            type: String,
            trim: true,
            default: "",
        },
        slug: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            lowercase: true,
        },
        status: {
            type: String,
            enum: ["active", "suspended"],
            default: "active",
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model("Tenant", TenantSchema);
