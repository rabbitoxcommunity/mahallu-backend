const express = require('express');
const router  = express.Router();
const auth    = require('../middleware/auth');
const {
  getTenantInfo,
  getPublicAnnouncements,
  getAnnouncementCategories,
  getPublicResults,
  searchBloodDonors,
  searchMarriageCertificates,
  getMarriageCertificate,
  searchDeathCertificates,
  getDeathCertificate,
  getAdminSettings,
  updateAdminSettings,
} = require('../controllers/publicPortalController');

// ── Public routes (no auth) ──────────────────────────────────────────────────
router.get('/tenant-info',              getTenantInfo);
router.get('/announcements',            getPublicAnnouncements);
router.get('/announcement-categories',  getAnnouncementCategories);
router.get('/results',                  getPublicResults);
router.get('/blood-donors',                    searchBloodDonors);
router.get('/marriage-certificates/search',    searchMarriageCertificates);
router.get('/marriage-certificate/:cert_no',   getMarriageCertificate);
router.get('/death-certificates/search',       searchDeathCertificates);
router.get('/death-certificate/:cert_id',      getDeathCertificate);

// ── Admin routes (auth required) ─────────────────────────────────────────────
router.get('/admin/settings',  auth, getAdminSettings);
router.put('/admin/settings',  auth, updateAdminSettings);

module.exports = router;
