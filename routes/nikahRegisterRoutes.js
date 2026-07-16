const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { generateRegister } = require('../controllers/nikahRegisterController');

router.use(auth);

router.post('/generate', generateRegister);

module.exports = router;
