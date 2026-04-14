const mongoose = require("mongoose");

const MemberSchema = new mongoose.Schema(
    {
        tenant_id: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            ref: "Tenant",
        },

        house_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "House",
            required: true,
        },

        full_name: {
            type: String,
            required: true,
        },

        dob: Date,

        gender: {
            type: String,
            enum: ["Male", "Female", "Other"],
        },

        relation_to_head: String,

        whatsapp: String,
        contact_number: String,

        yateem_status: {
            type: Boolean,
            default: false,
        },

        marital_status: {
            type: String,
            enum: ["Single", "Married", "Widow", "Divorced"],
        },

        religious_education: String,
        general_education: String,

        occupation: String,
        monthly_income: Number,

        blood_group: String,
        medical_notes: String,

        skills: String,

        is_family_head: {
            type: Boolean,
            default: false,
        },

        is_active: {
            type: Boolean,
            default: true,
        },
    },
    { timestamps: true }
);

MemberSchema.index({ tenant_id: 1 });
MemberSchema.index({ full_name: 1 });
MemberSchema.index({ whatsapp: 1 });
MemberSchema.index({ blood_group: 1 });

module.exports = mongoose.model("Member", MemberSchema);