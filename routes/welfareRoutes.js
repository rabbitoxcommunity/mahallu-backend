const router = require('express').Router();
const auth = require('../middleware/auth');

const {
  createProgram,
  getPrograms,
  getProgramById,
  updateProgram,
  deleteProgram
} = require('../controllers/welfareProgramController');

const {
  createDistribution,
  getDistributions,
  updateDistribution,
  deleteDistribution,
  getBeneficiaries,
  getFamilyWelfareHistory
} = require('../controllers/welfareDistributionController');

const { getDashboard } = require('../controllers/welfareDashboardController');
const { getReports } = require('../controllers/welfareReportController');

router.use(auth);

// Dashboard
router.get('/dashboard', getDashboard);

// Reports
router.get('/reports', getReports);

// Beneficiaries
router.get('/beneficiaries', getBeneficiaries);

// Family welfare history
router.get('/family/:id', getFamilyWelfareHistory);

// Programs
router.post('/programs', createProgram);
router.get('/programs', getPrograms);
router.get('/programs/:id', getProgramById);
router.put('/programs/:id', updateProgram);
router.delete('/programs/:id', deleteProgram);

// Distributions
router.post('/distributions', createDistribution);
router.get('/distributions', getDistributions);
router.put('/distributions/:id', updateDistribution);
router.delete('/distributions/:id', deleteDistribution);

module.exports = router;
