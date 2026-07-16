const mongoose = require('mongoose');

const marriageNocSchema = new mongoose.Schema({
  tenant_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true
  },
  noc_id: {
    type: String,
    required: true
  },
  noc_number: {
    type: String,
    required: true
  },
  date: { type: Date, required: true },
  to_address: { type: String },
  noc_content: { type: String },

  // Groom details
  groom_name: { type: String, required: true },
  groom_father: { type: String },
  groom_house_name: { type: String },
  groom_address: { type: String },
  groom_mahallu: { type: String },
  groom_nikkah_count: { type: String },

  // Bride details
  bride_name: { type: String, required: true },
  bride_father: { type: String },
  bride_house_name: { type: String },
  bride_address: { type: String },
  bride_mahallu: { type: String },
  bride_nikkah_count: { type: String },

  // Nikkah details
  nikkah_date: { type: Date },
  nikkah_place: { type: String },
  nikkah_performer: { type: String },

  certificate_language: { type: String, enum: ['en', 'ml'], default: 'en' },
  pdf_url: { type: String },
  created_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

// Compound index for tenant + noc_id
marriageNocSchema.index({ tenant_id: 1, noc_id: 1 }, { unique: true });
// Compound index for tenant + noc_number
marriageNocSchema.index({ tenant_id: 1, noc_number: 1 }, { unique: true });

module.exports = mongoose.model('MarriageNOC', marriageNocSchema);
