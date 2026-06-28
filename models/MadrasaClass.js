const mongoose = require('mongoose');

const MadrasaClassSchema = new mongoose.Schema({
    tenant_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    madrasa_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Madrasa', required: true },
    code: { type: String, trim: true },
    name: { type: String, required: true, trim: true },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    is_active: { type: Boolean, default: true },
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updated_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

MadrasaClassSchema.index({ tenant_id: 1, madrasa_id: 1 });

module.exports = mongoose.model('MadrasaClass', MadrasaClassSchema);
