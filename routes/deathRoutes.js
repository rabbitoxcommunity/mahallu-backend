const router = require('express').Router();
const auth = require('../middleware/auth');
const {
    createDeathRecord,
    getDeathRecords,
    getDeathById,
    updateDeathRecord,
    deleteDeathRecord,
    markCertificateGenerated,
    generatePDF,
    viewPDF,
} = require('../controllers/deathController');
const { getDashboard } = require('../controllers/deathDashboardController');
const { getReports } = require('../controllers/deathReportController');

router.use(auth);

router.get('/dashboard', getDashboard);
router.get('/reports', getReports);
router.post('/', createDeathRecord);
router.get('/', getDeathRecords);
router.get('/:id', getDeathById);
router.put('/:id', updateDeathRecord);
router.delete('/:id', deleteDeathRecord);
router.put('/:id/certificate', markCertificateGenerated);
router.get('/:id/pdf', generatePDF);
router.get('/:id/pdf/view', viewPDF);

module.exports = router;
