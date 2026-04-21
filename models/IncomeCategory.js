const mongoose = require('mongoose');

const incomeCategorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    unique: true
  },
  type: {
    type: String,
    enum: ['due', 'income'],
    required: true
  },
  description: {
    type: String,
    trim: true
  },
  is_active: {
    type: Boolean,
    default: true
  },
  tenant_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true
  },
  created_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Compound index for unique category name per tenant per type
incomeCategorySchema.index({ tenant_id: 1, name: 1, type: 1 }, { unique: true });

module.exports = mongoose.model('IncomeCategory', incomeCategorySchema);
