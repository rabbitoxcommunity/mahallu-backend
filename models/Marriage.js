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
    required: true
  },
  certificate_no: {
    type: String,
    required: true
  },
  groom_name: { type: String, required: true },
  groom_father: { type: String, required: true },
  groom_dob: { type: Date },
  groom_house_name: { type: String },
  groom_mahallu: { type: String },
  groom_address: { type: String },
  bride_name: { type: String, required: true },
  bride_father: { type: String, required: true },
  bride_dob: { type: Date },
  bride_house_name: { type: String },
  bride_mahallu: { type: String },
  bride_address: { type: String },
  date: { type: Date, required: true },
  nikkah_time: { type: String },
  place: { type: String, required: true },
  nikkah_mahallu: { type: String },
  performer_name: { type: String },
  performer_designation: { type: String },
  mobile: { type: String },
  notes: { type: String },
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
