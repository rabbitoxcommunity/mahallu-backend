const mongoose = require('mongoose');

const marriageSchema = new mongoose.Schema({
  tenant_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true
  },
  marriage_id: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  certificate_no: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  groom_name: {
    type: String,
    required: true
  },
  groom_father: {
    type: String,
    required: true
  },
  bride_name: {
    type: String,
    required: true
  },
  bride_father: {
    type: String,
    required: true
  },
  date: {
    type: Date,
    required: true
  },
  place: {
    type: String,
    required: true
  },
  mobile: {
    type: String,
    required: true
  },
  notes: {
    type: String
  },
  pdf_url: {
    type: String
  },
  created_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

// Compound index for tenant + marriage_id
marriageSchema.index({ tenant_id: 1, marriage_id: 1 }, { unique: true });
// Compound index for tenant + certificate_no
marriageSchema.index({ tenant_id: 1, certificate_no: 1 }, { unique: true });

module.exports = mongoose.model('Marriage', marriageSchema);
