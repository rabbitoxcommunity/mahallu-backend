const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const c = require('../controllers/resultController');

router.use(auth);

router.get('/members/search', c.searchMembers);
router.get('/subjects/by-class', c.getSubjectsByClass);
router.get('/', c.getResults);
router.post('/', c.createResult);
router.get('/:id', c.getResult);
router.put('/:id', c.updateResult);
router.patch('/:id/publish', c.publishResult);
router.delete('/:id', c.deleteResult);

module.exports = router;
