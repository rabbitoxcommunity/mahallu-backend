const Tenant              = require('../models/Tenant');
const PublicPortalSettings= require('../models/PublicPortalSettings');
const Announcement        = require('../models/Announcement');
const Result              = require('../models/Result');
const AcademicYear        = require('../models/AcademicYear');
const Member              = require('../models/Member');
const Marriage            = require('../models/Marriage');
const DeathRegistry       = require('../models/DeathRegistry');
const { generateMarriagePDF } = require('./marriageController');
const { generateDeathCertPDF } = require('./deathController');

// ── Resolve tenant_id from slug query param ──────────────────────────────────
const resolveTenant = async (slug) => {
  if (!slug) return null;
  return Tenant.findOne({ slug: slug.toLowerCase(), status: 'active' });
};

// ── Upsert default settings for a tenant ──────────────────────────────────────
const getOrCreateSettings = async (tenant_id) => {
  let settings = await PublicPortalSettings.findOne({ tenant_id });
  if (!settings) settings = await PublicPortalSettings.create({ tenant_id });
  return settings;
};

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC  (no auth)
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/portal/tenant-info?t=slug
exports.getTenantInfo = async (req, res) => {
  try {
    const tenant = await resolveTenant(req.query.t);
    if (!tenant) return res.status(404).json({ message: 'Mahallu not found' });

    const settings = await getOrCreateSettings(tenant._id);

    res.json({
      name:        tenant.name,
      slug:        tenant.slug,
      theme_color: settings.theme_color,
      contact: {
        phone:         settings.contact_phone,
        email:         settings.contact_email,
        address:       settings.contact_address,
        working_hours: settings.working_hours,
      },
      about_description: settings.about_description,
      services: {
        marriage_certificate:      settings.marriage_certificate,
        death_certificate:         settings.death_certificate,
        results:                   settings.results,
        blood_donor:               settings.blood_donor,
        announcements:             settings.announcements,
        about_page:                settings.about_page,
        contact_page:              settings.contact_page,
        blood_donor_show_contact:  settings.blood_donor_show_contact,
        islamic_services:          settings.islamic_services,
      },
      prayer_location: {
        latitude:  settings.prayer_latitude  || null,
        longitude: settings.prayer_longitude || null,
        city:      settings.prayer_city      || '',
        method:    settings.prayer_method    || 'MWL',
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/portal/announcements?t=slug&page=1&limit=10&category=
exports.getPublicAnnouncements = async (req, res) => {
  try {
    const tenant = await resolveTenant(req.query.t);
    if (!tenant) return res.status(404).json({ message: 'Mahallu not found' });

    const settings = await PublicPortalSettings.findOne({ tenant_id: tenant._id });
    if (settings && !settings.announcements)
      return res.status(403).json({ message: 'Announcements not enabled' });

    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 10);
    const skip  = (page - 1) * limit;

    const query = {
      tenant_id:  tenant._id,
      visibility: 'public',
      status:     'published',
    };
    if (req.query.category) query.category = req.query.category;

    const [announcements, total] = await Promise.all([
      Announcement.find(query)
        .select('title category body published_at attachment_url')
        .sort({ published_at: -1 })
        .skip(skip)
        .limit(limit),
      Announcement.countDocuments(query),
    ]);

    res.json({
      data:       announcements,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/portal/results?t=slug
exports.getPublicResults = async (req, res) => {
  try {
    const tenant = await resolveTenant(req.query.t);
    if (!tenant) return res.status(404).json({ message: 'Mahallu not found' });

    const settings = await PublicPortalSettings.findOne({ tenant_id: tenant._id });
    if (settings && !settings.results)
      return res.status(403).json({ message: 'Results not enabled' });

    const lockedYear = await AcademicYear.findOne({ tenant_id: tenant._id, is_portal_locked: true, is_active: true });

    if (!lockedYear) {
      return res.json({ data: [], locked_academic_year: null });
    }

    const results = await Result.find({
      tenant_id:         tenant._id,
      is_published:      true,
      academic_year_id:  lockedYear._id,
    })
      .select('student_name subjects total_max_marks total_obtained_marks percentage overall_grade is_pass teacher_remarks principal_remarks updatedAt')
      .populate('madrasa_id',      'name')
      .populate('class_id',        'name')
      .populate('result_type_id',  'name')
      .populate('academic_year_id','name year')
      .sort({ updatedAt: -1 })
      .limit(200);

    // Group by madrasa + class + result_type + academic_year
    // Skip results whose referenced documents (academic year, madrasa, class) were deleted
    const groups = {};
    for (const r of results) {
      if (!r.academic_year_id) continue;
      const key = [
        r.madrasa_id?._id,
        r.class_id?._id,
        r.result_type_id?._id,
        r.academic_year_id?._id,
      ].join('|');

      if (!groups[key]) {
        groups[key] = {
          madrasa:       r.madrasa_id?.name      || 'Unknown Madrasa',
          class_name:    r.class_id?.name         || 'Unknown Class',
          result_type:   r.result_type_id?.name   || 'Exam',
          academic_year: r.academic_year_id?.name || r.academic_year_id?.year || '',
          published_at:  r.updatedAt,
          students:      [],
        };
      }
      groups[key].students.push({
        name:        r.student_name,
        subjects:    (r.subjects || []).map(sub => ({
          subject_name:    sub.subject_name,
          obtained_marks:  sub.obtained_marks,
          max_marks:       sub.max_marks,
          grade:           sub.grade,
        })),
        total_marks: r.total_obtained_marks,
        max_marks:   r.total_max_marks,
        percentage:  r.percentage,
        grade:       r.overall_grade,
        is_pass:     r.is_pass,
      });
    }

    res.json({ data: Object.values(groups), locked_academic_year: lockedYear.name });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/portal/blood-donors?t=slug&blood_group=O%2B
exports.searchBloodDonors = async (req, res) => {
  try {
    const tenant = await resolveTenant(req.query.t);
    if (!tenant) return res.status(404).json({ message: 'Mahallu not found' });

    const settings = await getOrCreateSettings(tenant._id);
    if (!settings.blood_donor)
      return res.status(403).json({ message: 'Blood donor search not enabled' });

    const query = { tenant_id: tenant._id };
    if (req.query.blood_group) query.blood_group = req.query.blood_group;
    else return res.status(400).json({ message: 'blood_group is required' });

    const members = await Member.find(query)
      .select('full_name blood_group contact_number house_id')
      .populate('house_id', 'address')
      .sort({ full_name: 1 })
      .limit(100);

    const showContact = !!settings.blood_donor_show_contact;
    const data = members.map(m => ({
      name:        m.full_name,
      blood_group: m.blood_group,
      ...(showContact ? {
        ...(m.contact_number ? { phone: m.contact_number } : {}),
        ...(m.house_id?.address ? { address: m.house_id.address } : {}),
      } : {}),
    }));

    res.json({ data });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/portal/marriage-certificates/search?t=slug&q=003
exports.searchMarriageCertificates = async (req, res) => {
  try {
    const tenant = await resolveTenant(req.query.t);
    if (!tenant) return res.status(404).json({ message: 'Mahallu not found' });

    const settings = await PublicPortalSettings.findOne({ tenant_id: tenant._id });
    if (settings && !settings.marriage_certificate)
      return res.status(403).json({ message: 'Marriage certificate download not enabled' });

    const q = (req.query.q || '').trim();
    if (!q) return res.json({ data: [] });

    const regex = new RegExp(q, 'i');
    const marriages = await Marriage.find({
      tenant_id: tenant._id,
      $or: [
        { certificate_no: regex },
        { marriage_id:    regex },
        { groom_name:     regex },
        { bride_name:     regex },
      ],
    })
      .select('certificate_no marriage_id groom_name bride_name date')
      .sort({ date: -1 })
      .limit(20);

    res.json({ data: marriages });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/portal/marriage-certificate/:cert_no?t=slug
// cert_no can be either certificate_no (CERT-XXX) or marriage_id (MRG-XXX)
exports.getMarriageCertificate = async (req, res) => {
  try {
    const tenant = await resolveTenant(req.query.t);
    if (!tenant) return res.status(404).json({ message: 'Mahallu not found' });

    const settings = await PublicPortalSettings.findOne({ tenant_id: tenant._id });
    if (settings && !settings.marriage_certificate)
      return res.status(403).json({ message: 'Marriage certificate download not enabled' });

    const id = req.params.cert_no;
    const marriage = await Marriage.findOne({
      tenant_id: tenant._id,
      $or: [{ certificate_no: id }, { marriage_id: id }],
    });
    if (!marriage) return res.status(404).json({ message: 'Certificate not found' });

    let pdfUrl = marriage.pdf_url;
    if (!pdfUrl) {
      pdfUrl = await generateMarriagePDF(marriage);
      marriage.pdf_url = pdfUrl;
      await marriage.save();
    }

    res.redirect(pdfUrl);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/portal/announcement-categories?t=slug
exports.getAnnouncementCategories = async (req, res) => {
  try {
    const tenant = await resolveTenant(req.query.t);
    if (!tenant) return res.status(404).json({ message: 'Mahallu not found' });

    const cats = await Announcement.distinct('category', {
      tenant_id:  tenant._id,
      visibility: 'public',
      status:     'published',
    });

    res.json({ data: cats.filter(Boolean) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/portal/death-certificates/search?t=slug&q=003
exports.searchDeathCertificates = async (req, res) => {
  try {
    const tenant = await resolveTenant(req.query.t);
    if (!tenant) return res.status(404).json({ message: 'Mahallu not found' });

    const settings = await PublicPortalSettings.findOne({ tenant_id: tenant._id });
    if (settings && !settings.death_certificate)
      return res.status(403).json({ message: 'Death certificate download not enabled' });

    const q = (req.query.q || '').trim();
    if (!q) return res.json({ data: [] });

    const regex = new RegExp(q, 'i');
    const records = await DeathRegistry.find({
      tenant_id: tenant._id,
      $or: [
        { certificate_no: regex },
        { death_id:       regex },
        { name:           regex },
        { father_name:    regex },
      ],
    })
      .select('certificate_no death_id name father_name date_of_death age gender')
      .sort({ date_of_death: -1 })
      .limit(20);

    res.json({ data: records });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/portal/death-certificate/:cert_id?t=slug
exports.getDeathCertificate = async (req, res) => {
  try {
    const tenant = await resolveTenant(req.query.t);
    if (!tenant) return res.status(404).json({ message: 'Mahallu not found' });

    const settings = await PublicPortalSettings.findOne({ tenant_id: tenant._id });
    if (settings && !settings.death_certificate)
      return res.status(403).json({ message: 'Death certificate download not enabled' });

    const id = req.params.cert_id;
    const record = await DeathRegistry.findOne({
      tenant_id: tenant._id,
      $or: [{ certificate_no: id }, { death_id: id }],
    });
    if (!record) return res.status(404).json({ message: 'Certificate not found' });

    let pdfUrl = record.pdf_url;
    if (!pdfUrl) {
      pdfUrl = await generateDeathCertPDF(record);
      record.pdf_url = pdfUrl;
      await record.save();
    }

    res.redirect(pdfUrl);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN (auth required)
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/portal/admin/settings
exports.getAdminSettings = async (req, res) => {
  try {
    const [settings, tenant] = await Promise.all([
      getOrCreateSettings(req.user.tenant_id),
      Tenant.findById(req.user.tenant_id).select('slug name'),
    ]);
    res.json({ ...settings.toObject(), slug: tenant?.slug, tenant_name: tenant?.name });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PUT /api/portal/admin/settings
exports.updateAdminSettings = async (req, res) => {
  try {
    const allowed = [
      'marriage_certificate', 'death_certificate', 'results', 'blood_donor',
      'announcements', 'about_page', 'contact_page', 'blood_donor_show_contact',
      'contact_phone', 'contact_email', 'contact_address', 'working_hours',
      'about_description', 'theme_color',
      'islamic_services', 'prayer_latitude', 'prayer_longitude', 'prayer_city', 'prayer_method',
    ];
    const update = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) update[k] = req.body[k]; });

    const settings = await PublicPortalSettings.findOneAndUpdate(
      { tenant_id: req.user.tenant_id },
      { $set: update },
      { new: true, upsert: true },
    );
    res.json(settings);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
