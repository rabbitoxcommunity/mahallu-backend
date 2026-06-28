const mongoose = require('mongoose');

const ResultTypeSchema = new mongoose.Schema({
    tenant_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    code: { type: String, trim: true },
    name: { type: String, required: true, trim: true },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    is_active: { type: Boolean, default: true },
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updated_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

ResultTypeSchema.index({ tenant_id: 1, code: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('ResultType', ResultTypeSchema);
