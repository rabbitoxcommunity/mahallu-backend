const mongoose = require('mongoose');

const varisankhyaConfigSchema = new mongoose.Schema({
  tenant_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true
  },
  category: {
    type: String,
    required: true,
    enum: ['Normal', 'Poor', 'Miskeen'],
    index: true
  },
  monthly_amount: {
    type: Number,
    required: true,
    min: 0,
    default: 0
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

// Compound index for unique category per tenant
varisankhyaConfigSchema.index({ tenant_id: 1, category: 1 }, { unique: true });

module.exports = mongoose.model('VarisankhyaConfig', varisankhyaConfigSchema);
