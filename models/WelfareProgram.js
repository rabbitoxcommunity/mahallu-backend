const mongoose = require('mongoose');

const welfareProgramSchema = new mongoose.Schema({
  tenant_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true
  },
  program_code: {
    type: String,
    required: true,
    trim: true
  },
  program_name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  budget: {
    type: Number,
    default: 0,
    min: 0
  },
  funding_source: {
    type: String,
    enum: ['Zakat', 'Sadaqah', 'Donation', 'General Fund', 'Other'],
    required: true
  },
  start_date: {
    type: Date
  },
  end_date: {
    type: Date
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'completed'],
    default: 'active'
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

welfareProgramSchema.index({ tenant_id: 1, program_code: 1 }, { unique: true });

module.exports = mongoose.model('WelfareProgram', welfareProgramSchema);
