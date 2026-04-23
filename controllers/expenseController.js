const Expense = require('../models/Expense');

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
    console.log('Create Expense - Request Body:', req.body);
    console.log('Create Expense - File:', req.file);

    const {
      date,
      category,
      paid_to,
      amount,
      payment_method,
      reference_no,
      notes
    } = req.body || {};

    // Handle file upload
    let bill_file = null;
    if (req.file) {
      bill_file = {
        data: req.file.buffer,
        contentType: req.file.mimetype,
        filename: req.file.originalname
      };
    }

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
      created_by: req.user.id
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
    } = req.body || {};

    // Handle file upload
    let bill_file = undefined;
    if (req.file) {
      bill_file = {
        data: req.file.buffer,
        contentType: req.file.mimetype,
        filename: req.file.originalname
      };
    }

    const updateData = {
      date,
      category,
      paid_to,
      amount: Number(amount),
      payment_method,
      reference_no,
      notes
    };

    // Only update bill_file if a new file is uploaded
    if (bill_file) {
      updateData.bill_file = bill_file;
    }

    const expense = await Expense.findOneAndUpdate(
      { _id: req.params.id, tenant_id: req.user.tenant_id },
      updateData,
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
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      todayTotal,
      monthTotal,
      cashTotal,
      bankTotal,
      totalExpense
    ] = await Promise.all([
      Expense.aggregate([
        { $match: { tenant_id, date: { $gte: today }, is_active: true } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      Expense.aggregate([
        { $match: { tenant_id, date: { $gte: monthStart }, is_active: true } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      Expense.aggregate([
        { $match: { tenant_id, payment_method: 'cash', is_active: true } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      Expense.aggregate([
        { $match: { tenant_id, payment_method: { $in: ['upi', 'bank'] }, is_active: true } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      Expense.aggregate([
        { $match: { tenant_id, is_active: true } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ])
    ]);

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
