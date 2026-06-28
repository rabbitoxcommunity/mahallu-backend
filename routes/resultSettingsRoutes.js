const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const c = require('../controllers/resultSettingsController');

router.use(auth);

router.get('/academic-years/select', c.getAcademicYearsForSelect);
router.get('/academic-years', c.getAcademicYears);
router.post('/academic-years', c.createAcademicYear);
router.put('/academic-years/:id', c.updateAcademicYear);
router.delete('/academic-years/:id', c.deleteAcademicYear);

router.get('/madrasas/select', c.getMadrasasForSelect);
router.get('/madrasas', c.getMadrasas);
router.post('/madrasas', c.createMadrasa);
router.put('/madrasas/:id', c.updateMadrasa);
router.delete('/madrasas/:id', c.deleteMadrasa);

router.get('/classes', c.getClasses);
router.post('/classes', c.createClass);
router.put('/classes/:id', c.updateClass);
router.delete('/classes/:id', c.deleteClass);

router.get('/subjects', c.getSubjects);
router.post('/subjects', c.createSubject);
router.put('/subjects/:id', c.updateSubject);
router.delete('/subjects/:id', c.deleteSubject);

router.get('/result-types', c.getResultTypes);
router.post('/result-types', c.createResultType);
router.put('/result-types/:id', c.updateResultType);
router.delete('/result-types/:id', c.deleteResultType);

module.exports = router;
