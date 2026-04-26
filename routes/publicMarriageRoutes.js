const express = require('express');
const router = express.Router();
const {
  searchMarriage
} = require('../controllers/marriageController');

// Public routes (no auth required)
router.get('/search', searchMarriage);

module.exports = router;
