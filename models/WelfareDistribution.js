const mongoose = require('mongoose');

const welfareDistributionSchema = new mongoose.Schema({
  tenant_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true
  },
  distribution_no: {
    type: String,
    required: true
  },
  is_external: {
    type: Boolean,
    default: false
  },
  family_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'House',
    index: true
  },
  beneficiary_name: {
    type: String
  },
  beneficiary_contact: {
    type: String
  },
  program_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'WelfareProgram',
    required: true
  },
  distribution_type: {
    type: String,
    enum: ['Cash', 'Food Kit', 'Medicine', 'Education', 'Marriage', 'House Repair', 'Emergency Relief', 'Other'],
    required: true
  },
  funding_source: {
    type: String,
    enum: ['Zakat', 'Sadaqah', 'Donation', 'General Fund', 'Other'],
    required: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  distribution_date: {
    type: Date,
    required: true,
    index: true
  },
  attachment: {
    type: String
  },
  notes: {
    type: String
  },
  created_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  is_active: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

welfareDistributionSchema.index({ tenant_id: 1, distribution_no: 1 }, { unique: true });

module.exports = mongoose.model('WelfareDistribution', welfareDistributionSchema);
