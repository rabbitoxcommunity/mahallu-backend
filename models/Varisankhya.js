const mongoose = require("mongoose");

const VarisankhyaSchema = new mongoose.Schema(
    {
        tenant_id: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            ref: "Tenant",
            index: true,
        },

        house_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "House",
            required: true,
            index: true,
        },

        month: {
            type: Number,
            required: true,
            min: 1,
            max: 12,
        },

        year: {
            type: Number,
            required: true,
        },

        amount_due: {
            type: Number,
            required: true,
            default: 200,
        },

        amount_paid: {
            type: Number,
            default: 0,
        },

        status: {
            type: String,
            enum: ["paid", "unpaid", "partial"],
            default: "unpaid",
        },

        paid_date: {
            type: Date,
            default: null,
        },

        payment_method: {
            type: String,
            enum: ["cash", "upi", null],
            default: null,
        },

        received_by: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },

        notes: {
            type: String,
            default: "",
        },

        receipt_no: {
            type: String,
            default: null,
        },
    },
    { timestamps: true }
);

// Compound index to prevent duplicate entries for same house/month/year per tenant
VarisankhyaSchema.index(
    { tenant_id: 1, house_id: 1, month: 1, year: 1 },
    { unique: true }
);

// Index for querying by status and date ranges
VarisankhyaSchema.index({ tenant_id: 1, status: 1, month: 1, year: 1 });

module.exports = mongoose.model("Varisankhya", VarisankhyaSchema);
