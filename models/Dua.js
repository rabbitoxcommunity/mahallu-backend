const mongoose = require('mongoose');

const duaSchema = new mongoose.Schema({
  tenant_id:     { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  title:         { type: String, required: true, trim: true },
  category:      { type: String, trim: true, default: 'General' },
  description:   { type: String, default: '' },
  pdf_file:      { type: String, default: '' },  // filename only
  display_order: { type: Number, default: 0 },
  is_published:  { type: Boolean, default: false, index: true },
  is_featured:   { type: Boolean, default: false },
  is_active:     { type: Boolean, default: true, index: true },
  created_by:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  updated_by:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

duaSchema.index({ tenant_id: 1, is_published: 1, display_order: 1 });
duaSchema.index({ tenant_id: 1, category: 1 });

module.exports = mongoose.model('Dua', duaSchema);
