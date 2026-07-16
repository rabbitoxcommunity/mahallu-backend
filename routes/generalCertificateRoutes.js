const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { generateCertificate } = require('../controllers/generalCertificateController');

router.use(auth);

router.post('/generate', generateCertificate);

module.exports = router;
