const mongoose = require('mongoose');

const directIncomeSchema = new mongoose.Schema({
    tenant_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Tenant',
        required: true,
        index: true
    },
    income_code: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    category: {
        type: String,
        enum: ['donation', 'misc_income', 'event_income', 'charity_box', 'other'],
        required: true,
        index: true
    },
    source_name: {
        type: String,
        required: true,
        trim: true
    },
    amount: {
        type: Number,
        required: true,
        min: 0
    },
    date: {
        type: Date,
        default: Date.now,
        required: true,
        index: true
    },
    payment_method: {
        type: String,
        enum: ['cash', 'upi', 'bank'],
        required: true,
        default: 'cash'
    },
    reference_no: {
        type: String,
        default: ''
    },
    description: {
        type: String,
        default: ''
    },
    receipt_no: {
        type: String,
        default: ''
    },
    is_active: {
        type: Boolean,
        default: true,
        index: true
    },
    created_by: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }
}, {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

// Compound indexes
directIncomeSchema.index({ tenant_id: 1, category: 1 });
directIncomeSchema.index({ tenant_id: 1, date: 1 });

module.exports = mongoose.model('DirectIncome', directIncomeSchema);
