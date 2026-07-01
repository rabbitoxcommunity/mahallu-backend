const mongoose = require('mongoose');

// Template / subscription — created ONCE per recurring expense (salary, rent, etc.)
const dueExpenseSchema = new mongoose.Schema({
    tenant_id:    { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant',   required: true, index: true },
    expense_code: { type: String, required: true },
    category:     { type: String, required: true, index: true },
    paid_to:      { type: String, required: true, trim: true },
    whatsapp:     { type: String, trim: true, default: '' },
    amount:       { type: Number, required: true, min: 0 },   // monthly recurring amount
    start_month:  { type: Number, required: true, min: 1, max: 12 },
    start_year:   { type: Number, required: true },
    notes:        { type: String, default: '' },
    is_active:    { type: Boolean, default: true, index: true },
    created_by:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    updated_by:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

dueExpenseSchema.index({ tenant_id: 1, expense_code: 1 }, { unique: true });
dueExpenseSchema.index({ tenant_id: 1, category: 1 });

module.exports = mongoose.model('DueExpense', dueExpenseSchema);
