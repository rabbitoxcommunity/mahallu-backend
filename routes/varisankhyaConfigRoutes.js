const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const {
  getConfigs,
  getConfigByCategory,
  createOrUpdateConfig,
  updateConfig,
  deleteConfig
} = require('../controllers/varisankhyaConfigController');

router.use(auth);

router.route('/')
  .get(getConfigs)
  .post(createOrUpdateConfig);

router.route('/:category')
  .get(getConfigByCategory);

router.route('/:id')
  .put(updateConfig)
  .delete(deleteConfig);

module.exports = router;
