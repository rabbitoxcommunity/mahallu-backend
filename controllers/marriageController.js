const Marriage = require('../models/Marriage');
const Tenant = require('../models/Tenant');
const fs = require('fs');
const path = require('path');
const { fillTemplate, getBrowser } = require('../utils/pdfTemplate');
const { uploadToR2, streamFromR2ByUrl, deleteFromR2ByUrl } = require('../utils/r2Client');

const fmtDate = (d, locale = 'en-IN') =>
  d ? new Date(d).toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' }) : '-';

const calcAge = (dob, ref) => {
  if (!dob) return null;
  const b = new Date(dob), r = ref ? new Date(ref) : new Date();
  let age = r.getFullYear() - b.getFullYear();
  if (r.getMonth() < b.getMonth() || (r.getMonth() === b.getMonth() && r.getDate() < b.getDate())) age--;
  return age;
};

const dobAge = (dob, ref) => {
  if (!dob) return '-';
  const age = calcAge(dob, ref);
  return age !== null ? `${age}, ${fmtDate(dob)}` : fmtDate(dob);
};

const generateMarriageId = async (tenant_id) => {
  const last = await Marriage.findOne({ tenant_id }, { marriage_id: 1 }).sort({ created_at: -1 });
  const num = last ? parseInt(last.marriage_id.replace('MRG-', ''), 10) : 0;
  return `MRG-${String(num + 1).padStart(3, '0')}`;
};

const generateCertificateNo = async (tenant_id) => {
  const last = await Marriage.findOne({ tenant_id }, { certificate_no: 1 }).sort({ created_at: -1 });
  const num = last ? parseInt(last.certificate_no.replace('CERT-', ''), 10) : 0;
  return `CERT-${String(num + 1).padStart(3, '0')}`;
};

// Generate PDF by rendering the HTML certificate template with Puppeteer
const generateMarriagePDF = async (marriage) => {
  let page;
  try {
    const tenant = await Tenant.findById(marriage.tenant_id).select('name nameMalayalam address regNo slug');
    const mahalluName = tenant?.name || 'Mahallu';

    const iDate = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });

    const metaParts = [];
    if (tenant?.address) metaParts.push(tenant.address);
    if (tenant?.regNo) metaParts.push(`Regd. No: ${tenant.regNo}`);
    const mahalluMeta = metaParts.length ? metaParts.join(' • ') : 'Marriage Registration Office';

    const tplFile = marriage.certificate_language === 'ml'
      ? 'marriageCertificate.html'
      : 'marriageCertificateEn.html';
    const tplPath = path.join(__dirname, '../templates', tplFile);
    const tpl = fs.readFileSync(tplPath, 'utf8');

    const v = (x) => x || '-';

    const html = fillTemplate(tpl, {
      certificate_no: v(marriage.certificate_no),
      mahallu_name: mahalluName,
      mahallu_name_malayalam: tenant?.nameMalayalam || '', // intentionally blank when unset
      mahallu_meta: mahalluMeta,
      date: fmtDate(marriage.date),
      nikkah_time: v(marriage.nikkah_time),
      place: v(marriage.place),
      nikkah_mahallu: v(marriage.nikkah_mahallu),
      groom_name: v(marriage.groom_name),
      groom_dob_age: dobAge(marriage.groom_dob, marriage.date),
      groom_address: v(marriage.groom_address),
      groom_father: v(marriage.groom_father),
      groom_house_name: v(marriage.groom_house_name),
      groom_mahallu: v(marriage.groom_mahallu),
      bride_name: v(marriage.bride_name),
      bride_dob_age: dobAge(marriage.bride_dob, marriage.date),
      bride_address: v(marriage.bride_address),
      bride_father: v(marriage.bride_father),
      bride_house_name: v(marriage.bride_house_name),
      bride_mahallu: v(marriage.bride_mahallu),
      performer_name: v(marriage.performer_name),
      performer_designation: v(marriage.performer_designation),
      marriage_id: v(marriage.marriage_id),
      issue_date: iDate
    });

    const browser = await getBrowser();
    page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });

    const pdfBuffer = await page.pdf({
      width: '210mm',
      height: '297mm',
      printBackground: true,
      margin: { top: 0, bottom: 0, left: 0, right: 0 },
      tagged: false // skip accessibility tag tree — not needed, saves ~10KB
    });

    const tenantFolder = tenant?.slug || marriage.tenant_id.toString();
    return await uploadToR2(`certificates/${tenantFolder}/marriage/${marriage.certificate_no}.pdf`, pdfBuffer, {
      downloadName: `${marriage.certificate_no}.pdf`
    });
  } catch (error) {
    console.error('Error generating PDF:', error);
    throw error;
  } finally {
    if (page) await page.close();
  }
};

exports.generateMarriagePDF = generateMarriagePDF;

// @desc    Create marriage record (admin)
// @route   POST /api/admin/marriages/create
// @access  Private
exports.createMarriage = async (req, res) => {
  try {
    const {
      groom_name, groom_father, groom_dob, groom_house_name, groom_mahallu, groom_address,
      bride_name, bride_father, bride_dob, bride_house_name, bride_mahallu, bride_address,
      date, nikkah_time, place, nikkah_mahallu,
      performer_name, performer_designation,
      mobile, notes, certificate_language
    } = req.body;

    const tenant_id = req.user.tenant_id;

    // Generate IDs
    const marriage_id = await generateMarriageId(tenant_id);
    const certificate_no = await generateCertificateNo(tenant_id);

    // Create marriage record
    const marriage = await Marriage.create({
      tenant_id,
      marriage_id,
      certificate_no,
      groom_name, groom_father, groom_dob, groom_house_name, groom_mahallu, groom_address,
      bride_name, bride_father, bride_dob, bride_house_name, bride_mahallu, bride_address,
      date, nikkah_time, place, nikkah_mahallu,
      performer_name, performer_designation,
      mobile, notes,
      certificate_language: certificate_language === 'ml' ? 'ml' : 'en',
      created_by: req.user.id
    });

    // Generate PDF (async - don't block response)
    generateMarriagePDF(marriage)
      .then(async (pdf_url) => {
        marriage.pdf_url = pdf_url;
        await marriage.save();
        console.log('PDF generated and saved for:', marriage.certificate_no);
      })
      .catch((pdfError) => {
        console.error('PDF generation failed, but marriage record created:', pdfError);
      });

    res.status(201).json({
      message: 'Marriage record created successfully',
      marriage
    });
  } catch (err) {
    console.error('Error creating marriage:', err);
    res.status(500).json({ message: err.message });
  }
};

// @desc    Get all marriages (admin)
// @route   GET /api/admin/marriages
// @access  Private
exports.getAllMarriages = async (req, res) => {
  try {
    const { page = 1, limit = 10, search } = req.query;
    const tenant_id = req.user.tenant_id;

    const query = { tenant_id };
    
    if (search) {
      query.$or = [
        { groom_name: { $regex: search, $options: 'i' } },
        { bride_name: { $regex: search, $options: 'i' } },
        { mobile: { $regex: search, $options: 'i' } },
        { marriage_id: { $regex: search, $options: 'i' } },
        { certificate_no: { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (page - 1) * limit;

    const [marriages, total] = await Promise.all([
      Marriage.find(query)
        .populate('created_by', 'name')
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Marriage.countDocuments(query)
    ]);

    res.json({
      marriages,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit)
    });
  } catch (err) {
    console.error('Error fetching marriages:', err);
    res.status(500).json({ message: err.message });
  }
};

// @desc    Get single marriage by ID (admin)
// @route   GET /api/admin/marriages/:id
// @access  Private
exports.getMarriageById = async (req, res) => {
  try {
    const marriage = await Marriage.findOne({
      _id: req.params.id,
      tenant_id: req.user.tenant_id
    }).populate('created_by', 'name');

    if (!marriage) {
      return res.status(404).json({ message: 'Marriage record not found' });
    }

    res.json(marriage);
  } catch (err) {
    console.error('Error fetching marriage:', err);
    res.status(500).json({ message: err.message });
  }
};

// @desc    Update marriage (admin)
// @route   PUT /api/admin/marriages/:id
// @access  Private
exports.updateMarriage = async (req, res) => {
  try {
    const {
      groom_name, groom_father, groom_dob, groom_house_name, groom_mahallu, groom_address,
      bride_name, bride_father, bride_dob, bride_house_name, bride_mahallu, bride_address,
      date, nikkah_time, place, nikkah_mahallu,
      performer_name, performer_designation,
      mobile, notes, certificate_language
    } = req.body;

    const existing = await Marriage.findOne({ _id: req.params.id, tenant_id: req.user.tenant_id }, { certificate_language: 1, pdf_url: 1 });
    const nextLanguage = certificate_language === 'ml' ? 'ml' : 'en';
    // Clear the cached PDF so it gets regenerated with the updated details/language on next download.
    const languageChanged = existing && existing.certificate_language !== nextLanguage;
    if (languageChanged) await deleteFromR2ByUrl(existing.pdf_url);

    const marriage = await Marriage.findOneAndUpdate(
      { _id: req.params.id, tenant_id: req.user.tenant_id },
      {
        groom_name, groom_father, groom_dob, groom_house_name, groom_mahallu, groom_address,
        bride_name, bride_father, bride_dob, bride_house_name, bride_mahallu, bride_address,
        date, nikkah_time, place, nikkah_mahallu,
        performer_name, performer_designation,
        mobile, notes,
        certificate_language: nextLanguage,
        ...(languageChanged ? { pdf_url: null } : {})
      },
      { new: true, runValidators: true }
    );

    if (!marriage) {
      return res.status(404).json({ message: 'Marriage record not found' });
    }

    res.json({
      message: 'Marriage record updated successfully',
      marriage
    });
  } catch (err) {
    console.error('Error updating marriage:', err);
    res.status(500).json({ message: err.message });
  }
};

// @desc    Search marriage by mobile or certificate_no (public)
// @route   GET /api/public/marriages/search
// @access  Public
exports.searchMarriage = async (req, res) => {
  try {
    const { mobile, certificate_no, tenant_id } = req.query;

    if (!mobile && !certificate_no) {
      return res.status(400).json({ message: 'Mobile number or certificate number is required' });
    }

    const query = {};
    if (mobile) query.mobile = mobile;
    if (certificate_no) query.certificate_no = certificate_no;
    if (tenant_id) query.tenant_id = tenant_id;

    const marriages = await Marriage.find(query)
      .populate('created_by', 'name')
      .sort({ created_at: -1 });

    res.json(marriages);
  } catch (err) {
    console.error('Error searching marriage:', err);
    res.status(500).json({ message: err.message });
  }
};

// @desc    Generate marriage certificate PDF (admin)
// @route   GET /api/admin/marriages/:id/pdf
// @access  Private
exports.generatePDF = async (req, res) => {
  try {
    console.log('PDF generation endpoint called for ID:', req.params.id);
    
    const marriage = await Marriage.findOne({
      _id: req.params.id,
      tenant_id: req.user.tenant_id
    });

    if (!marriage) {
      console.log('Marriage not found');
      return res.status(404).json({ message: 'Marriage record not found' });
    }

    console.log('Marriage found:', marriage.certificate_no);

    // If PDF already exists, return the URL
    if (marriage.pdf_url) {
      console.log('PDF already exists:', marriage.pdf_url);
      return res.json({
        message: 'PDF already exists',
        pdf_url: marriage.pdf_url,
        marriage
      });
    }

    console.log('Generating new PDF...');
    // Generate new PDF
    const pdf_url = await generateMarriagePDF(marriage);
    marriage.pdf_url = pdf_url;
    await marriage.save();

    console.log('PDF generated successfully:', pdf_url);
    res.json({
      message: 'PDF generated successfully',
      pdf_url,
      marriage
    });
  } catch (err) {
    console.error('Error generating PDF:', err);
    console.error('Error stack:', err.stack);
    res.status(500).json({ message: err.message });
  }
};

// @desc    Stream marriage certificate PDF inline (for print/preview — no
//          Content-Disposition: attachment, unlike the R2 URL used for downloads)
// @route   GET /api/admin/marriages/:id/pdf/view
// @access  Private
exports.viewPDF = async (req, res) => {
  try {
    const marriage = await Marriage.findOne({
      _id: req.params.id,
      tenant_id: req.user.tenant_id
    });

    if (!marriage) {
      return res.status(404).json({ message: 'Marriage record not found' });
    }

    let pdfUrl = marriage.pdf_url;
    if (!pdfUrl) {
      pdfUrl = await generateMarriagePDF(marriage);
      marriage.pdf_url = pdfUrl;
      await marriage.save();
    }

    const obj = await streamFromR2ByUrl(pdfUrl);
    if (!obj) {
      // Legacy local path from before the R2 migration.
      return res.redirect(pdfUrl);
    }
    res.setHeader('Content-Type', obj.contentType || 'application/pdf');
    if (obj.contentLength) res.setHeader('Content-Length', obj.contentLength);
    obj.body.pipe(res);
  } catch (err) {
    console.error('Error streaming PDF:', err);
    res.status(500).json({ message: err.message });
  }
};
