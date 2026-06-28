const mongoose = require('mongoose');

const PublicPortalSettingsSchema = new mongoose.Schema({
  tenant_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    unique: true,
  },
  // Service toggles
  marriage_certificate: { type: Boolean, default: true },
  death_certificate:    { type: Boolean, default: false },
  results:              { type: Boolean, default: true },
  blood_donor:          { type: Boolean, default: true },
  announcements:        { type: Boolean, default: true },
  about_page:           { type: Boolean, default: true },
  contact_page:         { type: Boolean, default: true },
  // Blood donor: expose contact number?
  blood_donor_show_contact: { type: Boolean, default: false },
  // Branding / contact info
  contact_phone:    { type: String, default: '' },
  contact_email:    { type: String, default: '' },
  contact_address:  { type: String, default: '' },
  working_hours:    { type: String, default: '' },
  about_description:{ type: String, default: '' },
  theme_color:      { type: String, default: '#2563eb' },
}, { timestamps: true });

module.exports = mongoose.model('PublicPortalSettings', PublicPortalSettingsSchema);
