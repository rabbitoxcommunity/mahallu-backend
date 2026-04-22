const mongoose = require('mongoose');

const expenseSchema = new mongoose.Schema({
  tenant_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true
  },
  voucher_no: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  date: {
    type: Date,
    required: true,
    index: true
  },
  category: {
    type: String,
    required: true,
    index: true
  },
  paid_to: {
    type: String,
    required: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  payment_method: {
    type: String,
    enum: ['cash', 'upi', 'bank'],
    required: true
  },
  reference_no: {
    type: String,
    trim: true
  },
  notes: {
    type: String,
    trim: true
  },
  bill_file: {
    type: String,
    trim: true
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
  timestamps: true
});

// Index for filtering
expenseSchema.index({ tenant_id: 1, date: -1 });
expenseSchema.index({ tenant_id: 1, category: 1 });
expenseSchema.index({ tenant_id: 1, payment_method: 1 });

module.exports = mongoose.model('Expense', expenseSchema);
