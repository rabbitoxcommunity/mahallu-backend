const mongoose = require('mongoose');

const dueBasedIncomeSchema = new mongoose.Schema({
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
        enum: ['building_rent', 'shop_rent', 'coconut_sale', 'hall_rent', 'other'],
        required: true,
        index: true
    },
    source_name: {
        type: String,
        required: true,
        trim: true
    },
    month: {
        type: Number,
        required: true,
        min: 1,
        max: 12,
        index: true
    },
    year: {
        type: Number,
        required: true,
        index: true
    },
    amount_due: {
        type: Number,
        required: true,
        min: 0,
        default: 0
    },
    amount_paid: {
        type: Number,
        required: true,
        min: 0,
        default: 0
    },
    balance: {
        type: Number,
        required: true,
        min: 0,
        default: 0
    },
    due_date: {
        type: Date,
        required: true,
        index: true
    },
    status: {
        type: String,
        enum: ['paid', 'partial', 'unpaid', 'overdue'],
        default: 'unpaid',
        index: true
    },
    payment_method: {
        type: String,
        enum: ['cash', 'upi', 'bank', ''],
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
dueBasedIncomeSchema.index({ tenant_id: 1, category: 1, status: 1 });
dueBasedIncomeSchema.index({ tenant_id: 1, month: 1, year: 1 });
dueBasedIncomeSchema.index({ tenant_id: 1, due_date: 1 });

// Pre-save middleware removed temporarily to fix issue
// Balance and status will be calculated manually in controllers

module.exports = mongoose.model('DueBasedIncome', dueBasedIncomeSchema);
