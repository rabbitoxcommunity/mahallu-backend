const mongoose = require("mongoose");

const HouseSchema = new mongoose.Schema(
    {
        tenant_id: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            ref: "Tenant",
            index: true,
        },

        family_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Family",
            required: true,
            index: true,
        },

        house_code: {
            type: String,
            required: true,
            trim: true,
        },

        house_name: {
            type: String,
            required: true,
            trim: true,
        },

        address: String,

        primary_contact: {
            type: String,
            required: true,
        },

        economic_status: {
            type: String,
            enum: ["Normal", "Miskeen", "Poor"],
            default: "Normal",
        },

        zakat_eligible: {
            type: Boolean,
            default: false,
        },

        notes: String,

        is_active: {
            type: Boolean,
            default: true,
        },
    },
    { timestamps: true }
);

HouseSchema.index(
    { tenant_id: 1, house_code: 1 },
    { unique: true }
);

module.exports = mongoose.model("House", HouseSchema);