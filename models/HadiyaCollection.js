const mongoose = require("mongoose");

const HadiyaCollectionSchema = new mongoose.Schema(
    {
        tenant_id: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            ref: "Tenant",
            index: true,
        },

        collection_code: {
            type: String,
            required: true,
            unique: true,
            trim: true,
        },

        contributor_type: {
            type: String,
            enum: ["house", "external"],
            required: true,
        },

        house_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "House",
            default: null,
        },

        contributor_name: {
            type: String,
            trim: true,
            default: null,
        },

        contributor_place: {
            type: String,
            trim: true,
            default: null,
        },

        contributor_mobile: {
            type: String,
            trim: true,
            default: null,
        },

        amount: {
            type: Number,
            required: true,
            min: 0,
        },

        payment_method: {
            type: String,
            enum: ["cash", "upi", "bank"],
            required: true,
        },

        notes: {
            type: String,
            trim: true,
            default: "",
        },

        created_by: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },

        date: {
            type: Date,
            default: Date.now,
        },

        receipt_no: {
            type: String,
            default: null,
        },

        is_active: {
            type: Boolean,
            default: true,
        },
    },
    { timestamps: true }
);

// Index for querying by tenant and date
HadiyaCollectionSchema.index({ tenant_id: 1, date: -1 });
HadiyaCollectionSchema.index({ tenant_id: 1, contributor_type: 1 });
HadiyaCollectionSchema.index({ tenant_id: 1, collection_code: 1 });

module.exports = mongoose.model("HadiyaCollection", HadiyaCollectionSchema);
