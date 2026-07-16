const MarriageNOC = require('../models/MarriageNOC');
const Tenant = require('../models/Tenant');
const fs = require('fs');
const path = require('path');
const { fillTemplate, getBrowser } = require('../utils/pdfTemplate');
const { uploadToR2, streamFromR2ByUrl, deleteFromR2ByUrl } = require('../utils/r2Client');

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '-';

// The NOC body text is not entered by the admin — it's generated from a fixed
// per-language template with the groom/bride names substituted in, only for the PDF.
const NOC_CONTENT_TEMPLATES = {
  en: 'This certificate hereby certifies that the Mahallu grants its full approval and blessings for the sacred Nikah between {groom} and {bride}. The detailed information is provided below.',
  ml: '{groom} ഉം {bride} ഉം തമ്മിലുള്ള പവിത്രമായ നിക്കാഹിന് മഹല്ല് അതിന്റെ പൂർണ്ണ അംഗീകാരവും അനുഗ്രഹങ്ങളും നൽകുന്നതായി ഈ സാക്ഷ്യപത്രം മുഖേന സാക്ഷ്യപ്പെടുത്തുന്നു. വിശദവിവരങ്ങൾ താഴെ ചേർത്തിരിക്കുന്നു.'
};

const buildNocContent = (noc) => {
  const tpl = noc.certificate_language === 'ml' ? NOC_CONTENT_TEMPLATES.ml : NOC_CONTENT_TEMPLATES.en;
  return tpl
    .replace('{groom}', noc.groom_name || '-')
    .replace('{bride}', noc.bride_name || '-');
};

const generateNocId = async (tenant_id) => {
  const last = await MarriageNOC.findOne({ tenant_id }, { noc_id: 1 }).sort({ created_at: -1 });
  const num = last ? parseInt(last.noc_id.replace('NOCID-', ''), 10) : 0;
  return `NOCID-${String(num + 1).padStart(3, '0')}`;
};

const generateNocNumber = async (tenant_id) => {
  const last = await MarriageNOC.findOne({ tenant_id }, { noc_number: 1 }).sort({ created_at: -1 });
  const num = last ? parseInt(last.noc_number.replace('NOC-', ''), 10) : 0;
  return `NOC-${String(num + 1).padStart(3, '0')}`;
};

// Generate PDF by rendering the HTML certificate template with Puppeteer
const generateNocPDF = async (noc) => {
  let page;
  try {
    const tenant = await Tenant.findById(noc.tenant_id).select('name nameMalayalam address addressMalayalam regNo slug');
    const mahalluName = tenant?.name || 'Mahallu';
    const isMalayalam = noc.certificate_language === 'ml';

    const iDate = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const tenantAddress = isMalayalam ? (tenant?.addressMalayalam || tenant?.address) : tenant?.address;

    const tplFile = isMalayalam
      ? 'marriageNocCertificate.html'
      : 'marriageNocCertificateEn.html';
    const tplPath = path.join(__dirname, '../templates', tplFile);
    const tpl = fs.readFileSync(tplPath, 'utf8');

    const v = (x) => x || '-';

    const html = fillTemplate(tpl, {
      noc_number: v(noc.noc_number),
      mahallu_name: mahalluName,
      mahallu_name_malayalam: tenant?.nameMalayalam || '', // intentionally blank when unset
      mahallu_address: v(tenantAddress),
      mahallu_reg_no: v(tenant?.regNo),
      date: fmtDate(noc.date),
      to_address: v(noc.to_address),
      noc_content: buildNocContent(noc),
      groom_name: v(noc.groom_name),
      groom_father: v(noc.groom_father),
      groom_house_name: v(noc.groom_house_name),
      groom_address: v(noc.groom_address),
      groom_mahallu: v(noc.groom_mahallu),
      groom_nikkah_count: v(noc.groom_nikkah_count),
      bride_name: v(noc.bride_name),
      bride_father: v(noc.bride_father),
      bride_house_name: v(noc.bride_house_name),
      bride_address: v(noc.bride_address),
      bride_mahallu: v(noc.bride_mahallu),
      bride_nikkah_count: v(noc.bride_nikkah_count),
      nikkah_date: fmtDate(noc.nikkah_date),
      nikkah_place: v(noc.nikkah_place),
      nikkah_performer: v(noc.nikkah_performer),
      noc_id: v(noc.noc_id),
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
      tagged: false
    });

    const tenantFolder = tenant?.slug || noc.tenant_id.toString();
    return await uploadToR2(`certificates/${tenantFolder}/marriage-noc/${noc.noc_number}.pdf`, pdfBuffer, {
      downloadName: `${noc.noc_number}.pdf`
    });
  } catch (error) {
    console.error('Error generating NOC PDF:', error);
    throw error;
  } finally {
    if (page) await page.close();
  }
};

exports.generateNocPDF = generateNocPDF;

// @desc    Create marriage NOC record (admin)
// @route   POST /api/admin/marriage-noc/create
// @access  Private
exports.createNoc = async (req, res) => {
  try {
    const {
      to_address,
      groom_name, groom_father, groom_house_name, groom_address, groom_mahallu, groom_nikkah_count,
      bride_name, bride_father, bride_house_name, bride_address, bride_mahallu, bride_nikkah_count,
      nikkah_date, nikkah_place, nikkah_performer,
      certificate_language
    } = req.body;

    const tenant_id = req.user.tenant_id;

    const noc_id = await generateNocId(tenant_id);
    const noc_number = await generateNocNumber(tenant_id);

    const noc = await MarriageNOC.create({
      tenant_id,
      noc_id,
      noc_number,
      date: new Date(), // certificate date is auto-set to the day it is issued
      to_address,
      groom_name, groom_father, groom_house_name, groom_address, groom_mahallu, groom_nikkah_count,
      bride_name, bride_father, bride_house_name, bride_address, bride_mahallu, bride_nikkah_count,
      nikkah_date, nikkah_place, nikkah_performer,
      certificate_language: certificate_language === 'ml' ? 'ml' : 'en',
      created_by: req.user.id
    });

    // Generate PDF (async - don't block response)
    generateNocPDF(noc)
      .then(async (pdf_url) => {
        noc.pdf_url = pdf_url;
        await noc.save();
        console.log('NOC PDF generated and saved for:', noc.noc_number);
      })
      .catch((pdfError) => {
        console.error('NOC PDF generation failed, but record created:', pdfError);
      });

    res.status(201).json({
      message: 'Marriage NOC record created successfully',
      noc
    });
  } catch (err) {
    console.error('Error creating NOC:', err);
    res.status(500).json({ message: err.message });
  }
};

// @desc    Get all marriage NOCs (admin)
// @route   GET /api/admin/marriage-noc
// @access  Private
exports.getAllNocs = async (req, res) => {
  try {
    const { page = 1, limit = 10, search } = req.query;
    const tenant_id = req.user.tenant_id;

    const query = { tenant_id };

    if (search) {
      query.$or = [
        { groom_name: { $regex: search, $options: 'i' } },
        { bride_name: { $regex: search, $options: 'i' } },
        { noc_id: { $regex: search, $options: 'i' } },
        { noc_number: { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (page - 1) * limit;

    const [nocs, total] = await Promise.all([
      MarriageNOC.find(query)
        .populate('created_by', 'name')
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      MarriageNOC.countDocuments(query)
    ]);

    res.json({
      nocs,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit)
    });
  } catch (err) {
    console.error('Error fetching NOCs:', err);
    res.status(500).json({ message: err.message });
  }
};

// @desc    Get single marriage NOC by ID (admin)
// @route   GET /api/admin/marriage-noc/:id
// @access  Private
exports.getNocById = async (req, res) => {
  try {
    const noc = await MarriageNOC.findOne({
      _id: req.params.id,
      tenant_id: req.user.tenant_id
    }).populate('created_by', 'name');

    if (!noc) {
      return res.status(404).json({ message: 'Marriage NOC record not found' });
    }

    res.json(noc);
  } catch (err) {
    console.error('Error fetching NOC:', err);
    res.status(500).json({ message: err.message });
  }
};

// @desc    Update marriage NOC (admin)
// @route   PUT /api/admin/marriage-noc/:id
// @access  Private
exports.updateNoc = async (req, res) => {
  try {
    const {
      to_address,
      groom_name, groom_father, groom_house_name, groom_address, groom_mahallu, groom_nikkah_count,
      bride_name, bride_father, bride_house_name, bride_address, bride_mahallu, bride_nikkah_count,
      nikkah_date, nikkah_place, nikkah_performer,
      certificate_language
    } = req.body;

    const existing = await MarriageNOC.findOne({ _id: req.params.id, tenant_id: req.user.tenant_id }, { pdf_url: 1 });
    if (!existing) {
      return res.status(404).json({ message: 'Marriage NOC record not found' });
    }
    // Any edit changes the certificate contents, so drop the cached PDF and let it
    // regenerate from the updated record on the next download/print/view.
    if (existing.pdf_url) await deleteFromR2ByUrl(existing.pdf_url);

    const noc = await MarriageNOC.findOneAndUpdate(
      { _id: req.params.id, tenant_id: req.user.tenant_id },
      {
        to_address,
        groom_name, groom_father, groom_house_name, groom_address, groom_mahallu, groom_nikkah_count,
        bride_name, bride_father, bride_house_name, bride_address, bride_mahallu, bride_nikkah_count,
        nikkah_date, nikkah_place, nikkah_performer,
        certificate_language: certificate_language === 'ml' ? 'ml' : 'en',
        pdf_url: null
      },
      { new: true, runValidators: true }
    );

    res.json({
      message: 'Marriage NOC record updated successfully',
      noc
    });
  } catch (err) {
    console.error('Error updating NOC:', err);
    res.status(500).json({ message: err.message });
  }
};

// @desc    Generate marriage NOC certificate PDF (admin)
// @route   GET /api/admin/marriage-noc/:id/pdf
// @access  Private
exports.generatePDF = async (req, res) => {
  try {
    const noc = await MarriageNOC.findOne({
      _id: req.params.id,
      tenant_id: req.user.tenant_id
    });

    if (!noc) {
      return res.status(404).json({ message: 'Marriage NOC record not found' });
    }

    if (noc.pdf_url) {
      return res.json({ message: 'PDF already exists', pdf_url: noc.pdf_url, noc });
    }

    const pdf_url = await generateNocPDF(noc);
    noc.pdf_url = pdf_url;
    await noc.save();

    res.json({ message: 'PDF generated successfully', pdf_url, noc });
  } catch (err) {
    console.error('Error generating NOC PDF:', err);
    res.status(500).json({ message: err.message });
  }
};

// @desc    Stream marriage NOC certificate PDF inline (for print/preview)
// @route   GET /api/admin/marriage-noc/:id/pdf/view
// @access  Private
exports.viewPDF = async (req, res) => {
  try {
    const noc = await MarriageNOC.findOne({
      _id: req.params.id,
      tenant_id: req.user.tenant_id
    });

    if (!noc) {
      return res.status(404).json({ message: 'Marriage NOC record not found' });
    }

    let pdfUrl = noc.pdf_url;
    if (!pdfUrl) {
      pdfUrl = await generateNocPDF(noc);
      noc.pdf_url = pdfUrl;
      await noc.save();
    }

    const obj = await streamFromR2ByUrl(pdfUrl);
    if (!obj) {
      return res.redirect(pdfUrl);
    }
    res.setHeader('Content-Type', obj.contentType || 'application/pdf');
    if (obj.contentLength) res.setHeader('Content-Length', obj.contentLength);
    obj.body.pipe(res);
  } catch (err) {
    console.error('Error streaming NOC PDF:', err);
    res.status(500).json({ message: err.message });
  }
};
