const mongoose = require("mongoose");

const FamilySchema = new mongoose.Schema(
    {
        tenant_id: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            ref: "Tenant",
            index: true,
        },

        family_code: {
            type: String,
            required: true,
            trim: true,
        },

        family_name: {
            type: String,
            required: true,
            trim: true,
        },

        notes: String,

        is_active: {
            type: Boolean,
            default: true,
        },
    },
    { timestamps: true }
);

FamilySchema.index(
    { tenant_id: 1, family_code: 1 },
    { unique: true }
);

FamilySchema.index(
    { tenant_id: 1, family_name: 1 },
    { unique: true }
);

module.exports = mongoose.model("Family", FamilySchema);