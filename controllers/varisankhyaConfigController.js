const VarisankhyaConfig = require('../models/VarisankhyaConfig');

// @desc    Get all varisankhya configs for tenant
// @route   GET /api/settings/varisankhya-config
// @access  Private
exports.getConfigs = async (req, res, next) => {
  try {
    const configs = await VarisankhyaConfig.find({
      tenant_id: req.user.tenant_id
    }).populate('created_by', 'name');

    res.json(configs);
  } catch (err) {
    console.error('Error fetching varisankhya configs:', err);
    res.status(500).json({ message: err.message });
  }
};

// @desc    Get single config by category
// @route   GET /api/settings/varisankhya-config/:category
// @access  Private
exports.getConfigByCategory = async (req, res, next) => {
  try {
    const config = await VarisankhyaConfig.findOne({
      tenant_id: req.user.tenant_id,
      category: req.params.category
    }).populate('created_by', 'name');

    if (!config) {
      return res.status(404).json({ message: 'Config not found' });
    }

    res.json(config);
  } catch (err) {
    console.error('Error fetching config:', err);
    res.status(500).json({ message: err.message });
  }
};

// @desc    Create or update config
// @route   POST /api/settings/varisankhya-config
// @access  Private
exports.createOrUpdateConfig = async (req, res, next) => {
  try {
    const { category, monthly_amount, is_active } = req.body;

    const config = await VarisankhyaConfig.findOneAndUpdate(
      {
        tenant_id: req.user.tenant_id,
        category
      },
      {
        category,
        monthly_amount: Number(monthly_amount),
        is_active: is_active !== undefined ? is_active : true,
        tenant_id: req.user.tenant_id,
        created_by: req.user.id
      },
      {
        upsert: true,
        new: true,
        runValidators: true,
        setDefaultsOnInsert: true
      }
    ).populate('created_by', 'name');

    res.status(201).json(config);
  } catch (err) {
    console.error('Error creating/updating config:', err);
    if (err.code === 11000) {
      return res.status(400).json({ message: 'Config for this category already exists' });
    }
    res.status(500).json({ message: err.message });
  }
};

// @desc    Update config
// @route   PUT /api/settings/varisankhya-config/:id
// @access  Private
exports.updateConfig = async (req, res, next) => {
  try {
    const { monthly_amount, is_active } = req.body;

    const config = await VarisankhyaConfig.findOneAndUpdate(
      {
        _id: req.params.id,
        tenant_id: req.user.tenant_id
      },
      {
        monthly_amount: Number(monthly_amount),
        is_active
      },
      {
        new: true,
        runValidators: true
      }
    ).populate('created_by', 'name');

    if (!config) {
      return res.status(404).json({ message: 'Config not found' });
    }

    res.json(config);
  } catch (err) {
    console.error('Error updating config:', err);
    res.status(500).json({ message: err.message });
  }
};

// @desc    Delete config
// @route   DELETE /api/settings/varisankhya-config/:id
// @access  Private
exports.deleteConfig = async (req, res, next) => {
  try {
    const config = await VarisankhyaConfig.findOneAndDelete({
      _id: req.params.id,
      tenant_id: req.user.tenant_id
    });

    if (!config) {
      return res.status(404).json({ message: 'Config not found' });
    }

    res.json({ message: 'Config deleted successfully' });
  } catch (err) {
    console.error('Error deleting config:', err);
    res.status(500).json({ message: err.message });
  }
};

// @desc    Get amount for a category (helper function for due generation)
// @access  Private (internal use)
exports.getAmountByCategory = async (tenant_id, category) => {
  try {
    const config = await VarisankhyaConfig.findOne({
      tenant_id,
      category,
      is_active: true
    });

    return config ? config.monthly_amount : 0;
  } catch (err) {
    console.error('Error getting amount by category:', err);
    return 0;
  }
};
