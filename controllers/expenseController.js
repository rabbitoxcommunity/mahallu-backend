const Expense = require('../models/Expense');
const mongoose = require('mongoose');

// Helper function to generate voucher number
const generateVoucherNo = async (tenant_id) => {
  const lastExpense = await Expense.findOne({ tenant_id })
    .sort({ voucher_no: -1 })
    .select('voucher_no');

  if (!lastExpense || !lastExpense.voucher_no) {
    return 'EXP-001';
  }

  const lastNumber = parseInt(lastExpense.voucher_no.split('-')[1]);
  const newNumber = lastNumber + 1;
  return `EXP-${String(newNumber).padStart(3, '0')}`;
};

// @desc    Get all expenses with filters and pagination
// @route   GET /api/finance/expense
// @access  Private
exports.getExpenses = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 20,
      search,
      category,
      payment_method,
      date_from,
      date_to
    } = req.query;

    const query = {
      tenant_id: req.user.tenant_id,
      is_active: true
    };

    // Search filter
    if (search) {
      query.$or = [
        { voucher_no: { $regex: search, $options: 'i' } },
        { paid_to: { $regex: search, $options: 'i' } },
        { notes: { $regex: search, $options: 'i' } }
      ];
    }

    // Category filter
    if (category) {
      query.category = category;
    }

    // Payment method filter
    if (payment_method) {
      query.payment_method = payment_method;
    }

    // Date range filter
    if (date_from || date_to) {
      query.date = {};
      if (date_from) {
        query.date.$gte = new Date(date_from);
      }
      if (date_to) {
        query.date.$lte = new Date(date_to);
      }
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [expenses, total] = await Promise.all([
      Expense.find(query)
        .populate('created_by', 'name')
        .sort({ date: -1, createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Expense.countDocuments(query)
    ]);

    res.json({
      expenses,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit))
    });
  } catch (err) {
    console.error('Error fetching expenses:', err);
    res.status(500).json({ message: err.message });
  }
};

// @desc    Get single expense
// @route   GET /api/finance/expense/:id
// @access  Private
exports.getExpenseById = async (req, res, next) => {
  try {
    const expense = await Expense.findOne({
      _id: req.params.id,
      tenant_id: req.user.tenant_id
    }).populate('created_by', 'name');

    if (!expense) {
      return res.status(404).json({ message: 'Expense not found' });
    }

    res.json(expense);
  } catch (err) {
    console.error('Error fetching expense:', err);
    res.status(500).json({ message: err.message });
  }
};

// @desc    Create new expense
// @route   POST /api/finance/expense
// @access  Private
exports.createExpense = async (req, res, next) => {
  try {
    const {
      date,
      category,
      paid_to,
      amount,
      payment_method,
      reference_no,
      notes
    } = req.body;

    // Handle file upload
    const bill_file = req.file ? req.file.filename : null;

    const voucher_no = await generateVoucherNo(req.user.tenant_id);

    const expense = await Expense.create({
      voucher_no,
      date,
      category,
      paid_to,
      amount: Number(amount),
      payment_method,
      reference_no,
      notes,
      bill_file,
      tenant_id: req.user.tenant_id,
      created_by: req.user.id,
      is_active: true
    });

    const populatedExpense = await Expense.findById(expense._id).populate('created_by', 'name');

    res.status(201).json(populatedExpense);
  } catch (err) {
    console.error('Error creating expense:', err);
    if (err.code === 11000) {
      return res.status(400).json({ message: 'Voucher number already exists' });
    }
    res.status(500).json({ message: err.message });
  }
};

// @desc    Update expense
// @route   PUT /api/finance/expense/:id
// @access  Private
exports.updateExpense = async (req, res, next) => {
  try {
    const {
      date,
      category,
      paid_to,
      amount,
      payment_method,
      reference_no,
      notes
    } = req.body;

    // Handle file upload
    const bill_file = req.file ? req.file.filename : req.body.bill_file;

    const expense = await Expense.findOneAndUpdate(
      { _id: req.params.id, tenant_id: req.user.tenant_id },
      {
        date,
        category,
        paid_to,
        amount: Number(amount),
        payment_method,
        reference_no,
        notes,
        bill_file
      },
      { new: true, runValidators: true }
    ).populate('created_by', 'name');

    if (!expense) {
      return res.status(404).json({ message: 'Expense not found' });
    }

    res.json(expense);
  } catch (err) {
    console.error('Error updating expense:', err);
    res.status(500).json({ message: err.message });
  }
};

// @desc    Delete expense
// @route   DELETE /api/finance/expense/:id
// @access  Private
exports.deleteExpense = async (req, res, next) => {
  try {
    const expense = await Expense.findOneAndDelete({
      _id: req.params.id,
      tenant_id: req.user.tenant_id
    });

    if (!expense) {
      return res.status(404).json({ message: 'Expense not found' });
    }

    res.json({ message: 'Expense deleted successfully' });
  } catch (err) {
    console.error('Error deleting expense:', err);
    res.status(500).json({ message: err.message });
  }
};

// @desc    Get expense summary
// @route   GET /api/finance/expense/summary
// @access  Private
exports.getExpenseSummary = async (req, res, next) => {
  try {
    const tenant_id = req.user.tenant_id;
    const now = new Date();
    // Get start of today in UTC
    const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    // Get start of month in UTC
    const monthStart = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));

    console.log('Expense Summary - tenant_id:', tenant_id);
    console.log('Expense Summary - tenant_id type:', typeof tenant_id);
    console.log('Expense Summary - today:', today);
    console.log('Expense Summary - monthStart:', monthStart);

    // Count total expenses for this tenant
    const countResult = await Expense.countDocuments({ tenant_id });
    console.log('Expense Summary - total count:', countResult);

    // Get sample expense to check tenant_id format
    const sampleExpense = await Expense.findOne({ tenant_id });
    console.log('Expense Summary - sample expense:', sampleExpense);
    console.log('Expense Summary - sample expense tenant_id:', sampleExpense?.tenant_id);
    console.log('Expense Summary - sample expense tenant_id type:', typeof sampleExpense?.tenant_id);

    const tenantObjectId = new mongoose.Types.ObjectId(tenant_id);

    const [
      todayTotal,
      monthTotal,
      cashTotal,
      bankTotal,
      totalExpense
    ] = await Promise.all([
      Expense.aggregate([
        { $match: { tenant_id: tenantObjectId, date: { $gte: today } } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      Expense.aggregate([
        { $match: { tenant_id: tenantObjectId, date: { $gte: monthStart } } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      Expense.aggregate([
        { $match: { tenant_id: tenantObjectId, payment_method: 'cash' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      Expense.aggregate([
        { $match: { tenant_id: tenantObjectId, payment_method: { $in: ['upi', 'bank'] } } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      Expense.aggregate([
        { $match: { tenant_id: tenantObjectId } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ])
    ]);

    console.log('Expense Summary - todayTotal:', todayTotal);
    console.log('Expense Summary - monthTotal:', monthTotal);
    console.log('Expense Summary - cashTotal:', cashTotal);
    console.log('Expense Summary - bankTotal:', bankTotal);
    console.log('Expense Summary - totalExpense:', totalExpense);

    // Check if expense_date field exists in all expenses
    const allExpenses = await Expense.find({ tenant_id: tenantObjectId });
    console.log('Expense Summary - all expenses:', allExpenses.map(e => ({ date: e.date, expense_date: e.expense_date, amount: e.amount })));

    res.json({
      today_total: todayTotal[0]?.total || 0,
      month_total: monthTotal[0]?.total || 0,
      cash_total: cashTotal[0]?.total || 0,
      bank_total: bankTotal[0]?.total || 0,
      total: totalExpense[0]?.total || 0
    });
  } catch (err) {
    console.error('Error fetching expense summary:', err);
    res.status(500).json({ message: err.message });
  }
};
