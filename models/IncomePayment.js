const mongoose = require('mongoose');

const incomePaymentSchema = new mongoose.Schema({
    tenant_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Tenant',
        required: true,
        index: true
    },
    due_income_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'DueBasedIncome',
        required: true,
        index: true
    },
    payment_amount: {
        type: Number,
        required: true,
        min: 0
    },
    payment_method: {
        type: String,
        enum: ['cash', 'upi', 'bank'],
        required: true,
        default: 'cash'
    },
    payment_date: {
        type: Date,
        default: Date.now,
        required: true
    },
    reference_no: {
        type: String,
        default: ''
    },
    notes: {
        type: String,
        default: ''
    },
    receipt_no: {
        type: String,
        default: ''
    },
    received_by: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }
}, {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

// Compound index
incomePaymentSchema.index({ tenant_id: 1, due_income_id: 1, payment_date: -1 });

module.exports = mongoose.model('IncomePayment', incomePaymentSchema);
