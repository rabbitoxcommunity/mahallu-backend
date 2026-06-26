const router = require('express').Router();
const auth = require('../middleware/auth');
const {
    createAnnouncement,
    getAnnouncements,
    getAnnouncementById,
    updateAnnouncement,
    publishAnnouncement,
    deleteAnnouncement,
    getPublished,
    getCommSettings,
    updateCommSettings,
} = require('../controllers/announcementController');
const {
    createTemplate,
    getTemplates,
    getTemplateById,
    updateTemplate,
    deleteTemplate,
} = require('../controllers/templateController');

router.use(auth);

// Static routes first (before /:id wildcard)
router.get('/published', getPublished);
router.get('/settings', getCommSettings);
router.put('/settings', updateCommSettings);

// Templates (prefix routes before /:id)
router.post('/templates', createTemplate);
router.get('/templates', getTemplates);
router.get('/templates/:id', getTemplateById);
router.put('/templates/:id', updateTemplate);
router.delete('/templates/:id', deleteTemplate);

// Announcements CRUD
router.post('/', createAnnouncement);
router.get('/', getAnnouncements);
router.get('/:id', getAnnouncementById);
router.put('/:id', updateAnnouncement);
router.put('/:id/publish', publishAnnouncement);
router.delete('/:id', deleteAnnouncement);

module.exports = router;
