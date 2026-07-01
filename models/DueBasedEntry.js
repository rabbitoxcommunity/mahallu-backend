const mongoose = require('mongoose');

// Auto-generated monthly entry per DueBasedIncome template
const dueBasedEntrySchema = new mongoose.Schema({
    tenant_id:      { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant',        required: true, index: true },
    template_id:    { type: mongoose.Schema.Types.ObjectId, ref: 'DueBasedIncome', required: true, index: true },
    month:          { type: Number, required: true, min: 1, max: 12 },
    year:           { type: Number, required: true },
    amount_due:     { type: Number, required: true, min: 0 },
    amount_paid:    { type: Number, required: true, default: 0, min: 0 },
    balance:        { type: Number, required: true, min: 0 },
    status:         { type: String, enum: ['paid', 'partial', 'unpaid', 'overdue'], default: 'unpaid' },
    due_date:       { type: Date },
    payment_method: { type: String, default: '' },
    receipt_no:     { type: String, default: '' },
    is_active:      { type: Boolean, default: true },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

dueBasedEntrySchema.index({ tenant_id: 1, template_id: 1, month: 1, year: 1 }, { unique: true });
dueBasedEntrySchema.index({ tenant_id: 1, year: 1, month: 1 });
dueBasedEntrySchema.index({ tenant_id: 1, status: 1 });

module.exports = mongoose.model('DueBasedEntry', dueBasedEntrySchema);
