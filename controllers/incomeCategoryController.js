const IncomeCategory = require('../models/IncomeCategory');

// @desc    Get all income categories
// @route   GET /api/settings/income-categories
// @access  Private
exports.getIncomeCategories = async (req, res, next) => {
  try {
    const { type } = req.query;
    const tenant_id = req.user.tenant_id;

    const query = { tenant_id, is_active: true };
    if (type) query.type = type;

    const categories = await IncomeCategory.find(query)
      .populate('created_by', 'name')
      .sort({ name: 1 });

    res.json(categories);
  } catch (err) {
    console.error('Error fetching income categories:', err);
    res.status(500).json({ message: err.message });
  }
};

// @desc    Get single income category by ID
// @route   GET /api/settings/income-categories/:id
// @access  Private
exports.getIncomeCategoryById = async (req, res, next) => {
  try {
    const category = await IncomeCategory.findOne({
      _id: req.params.id,
      tenant_id: req.user.tenant_id,
      is_active: true
    }).populate('created_by', 'name');

    if (!category) {
      return res.status(404).json({ message: 'Income category not found' });
    }

    res.json(category);
  } catch (err) {
    console.error('Error fetching income category:', err);
    res.status(500).json({ message: err.message });
  }
};

// @desc    Create new income category
// @route   POST /api/settings/income-categories
// @access  Private
exports.createIncomeCategory = async (req, res, next) => {
  try {
    const { name, type, description } = req.body;

    if (!name || !type) {
      return res.status(400).json({ message: 'Name and type are required' });
    }

    const category = new IncomeCategory({
      name,
      type,
      description,
      tenant_id: req.user.tenant_id,
      created_by: req.user.id
    });

    await category.save();

    const populatedCategory = await IncomeCategory.findById(category._id).populate('created_by', 'name');

    res.status(201).json(populatedCategory);
  } catch (err) {
    console.error('Error creating income category:', err);
    if (err.code === 11000) {
      return res.status(400).json({ message: 'Category with this name already exists for this type' });
    }
    res.status(500).json({ message: err.message });
  }
};

// @desc    Update income category
// @route   PUT /api/settings/income-categories/:id
// @access  Private
exports.updateIncomeCategory = async (req, res, next) => {
  try {
    const { name, type, description, is_active } = req.body;

    const category = await IncomeCategory.findOne({
      _id: req.params.id,
      tenant_id: req.user.tenant_id
    });

    if (!category) {
      return res.status(404).json({ message: 'Income category not found' });
    }

    if (name) category.name = name;
    if (type) category.type = type;
    if (description !== undefined) category.description = description;
    if (is_active !== undefined) category.is_active = is_active;

    await category.save();

    const updatedCategory = await IncomeCategory.findById(category._id).populate('created_by', 'name');

    res.json(updatedCategory);
  } catch (err) {
    console.error('Error updating income category:', err);
    if (err.code === 11000) {
      return res.status(400).json({ message: 'Category with this name already exists for this type' });
    }
    res.status(500).json({ message: err.message });
  }
};

// @desc    Delete income category (hard delete)
// @route   DELETE /api/settings/income-categories/:id
// @access  Private
exports.deleteIncomeCategory = async (req, res, next) => {
  try {
    const category = await IncomeCategory.findOneAndDelete({
      _id: req.params.id,
      tenant_id: req.user.tenant_id
    });

    if (!category) {
      return res.status(404).json({ message: 'Income category not found' });
    }

    res.json({ message: 'Income category deleted successfully' });
  } catch (err) {
    console.error('Error deleting income category:', err);
    res.status(500).json({ message: err.message });
  }
};
