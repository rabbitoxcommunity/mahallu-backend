const ExpenseCategory = require('../models/ExpenseCategory');

// @desc    Get all expense categories
// @route   GET /api/settings/expense-categories
// @access  Private
exports.getExpenseCategories = async (req, res, next) => {
  try {
    const { type } = req.query;
    const query = {
      tenant_id: req.user.tenant_id,
      is_active: true
    };
    
    const categories = await ExpenseCategory.find(query)
      .populate('created_by', 'name')
      .sort({ name: 1 });

    res.json(categories);
  } catch (err) {
    console.error('Error fetching expense categories:', err);
    res.status(500).json({ message: err.message });
  }
};

// @desc    Get single expense category
// @route   GET /api/settings/expense-categories/:id
// @access  Private
exports.getExpenseCategoryById = async (req, res, next) => {
  try {
    const category = await ExpenseCategory.findOne({
      _id: req.params.id,
      tenant_id: req.user.tenant_id
    }).populate('created_by', 'name');

    if (!category) {
      return res.status(404).json({ message: 'Expense category not found' });
    }

    res.json(category);
  } catch (err) {
    console.error('Error fetching expense category:', err);
    res.status(500).json({ message: err.message });
  }
};

// @desc    Create new expense category
// @route   POST /api/settings/expense-categories
// @access  Private
exports.createExpenseCategory = async (req, res, next) => {
  try {
    const { name, description } = req.body;

    const category = await ExpenseCategory.create({
      name,
      description,
      tenant_id: req.user.tenant_id,
      created_by: req.user.id
    });

    const populatedCategory = await ExpenseCategory.findById(category._id).populate('created_by', 'name');

    res.status(201).json(populatedCategory);
  } catch (err) {
    console.error('Error creating expense category:', err);
    if (err.code === 11000) {
      return res.status(400).json({ message: 'Category with this name already exists' });
    }
    res.status(500).json({ message: err.message });
  }
};

// @desc    Update expense category
// @route   PUT /api/settings/expense-categories/:id
// @access  Private
exports.updateExpenseCategory = async (req, res, next) => {
  try {
    const { name, description } = req.body;

    const category = await ExpenseCategory.findOneAndUpdate(
      { _id: req.params.id, tenant_id: req.user.tenant_id },
      { name, description },
      { new: true, runValidators: true }
    ).populate('created_by', 'name');

    if (!category) {
      return res.status(404).json({ message: 'Expense category not found' });
    }

    res.json(category);
  } catch (err) {
    console.error('Error updating expense category:', err);
    if (err.code === 11000) {
      return res.status(400).json({ message: 'Category with this name already exists' });
    }
    res.status(500).json({ message: err.message });
  }
};

// @desc    Delete expense category (hard delete)
// @route   DELETE /api/settings/expense-categories/:id
// @access  Private
exports.deleteExpenseCategory = async (req, res, next) => {
  try {
    const category = await ExpenseCategory.findOneAndDelete({
      _id: req.params.id,
      tenant_id: req.user.tenant_id
    });

    if (!category) {
      return res.status(404).json({ message: 'Expense category not found' });
    }

    res.json({ message: 'Expense category deleted successfully' });
  } catch (err) {
    console.error('Error deleting expense category:', err);
    res.status(500).json({ message: err.message });
  }
};
