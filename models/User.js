const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema(
    {
        tenant_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Tenant",
            required: function () {
                return this.role !== "platformAdmin";
            },
            index: true,
        },

        name: {
            type: String,
            required: true,
            trim: true,
        },

        email: {
            type: String,
            required: true,
            trim: true,
        },

        password: {
            type: String,
            required: true,
        },

        role: {
            type: String,
            enum: [
                "platformAdmin",
                "superAdmin",
                "admin",
                "user",
            ],
            required: true,
        },

        permissions: {
            family: { type: Boolean, default: false },
            dashboard: { type: Boolean, default: false },
            finance: { type: Boolean, default: false },
        },

        is_active: {
            type: Boolean,
            default: true,
        },
    },
    { timestamps: true }
);

UserSchema.index(
    { tenant_id: 1, email: 1 },
    { unique: true }
);

module.exports = mongoose.model("User", UserSchema);