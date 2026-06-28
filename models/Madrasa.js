const mongoose = require('mongoose');

const MadrasaSchema = new mongoose.Schema({
    tenant_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    code: { type: String, trim: true },
    name: { type: String, required: true, trim: true },
    type: { type: String, enum: ['morning', 'evening', 'weekend', 'full_time', 'other'], default: 'morning' },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    is_active: { type: Boolean, default: true },
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updated_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

MadrasaSchema.index({ tenant_id: 1 });

module.exports = mongoose.model('Madrasa', MadrasaSchema);
