const Tenant = require('../models/Tenant');
const fs = require('fs');
const path = require('path');
const { fillTemplate, getBrowser } = require('../utils/pdfTemplate');

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '-';

// @desc    Generate a general certificate PDF on the fly (no record is stored).
//          Title + free-text body, ornate design, EN or ML template, with the
//          org header from the requesting user's tenant and blank President /
//          Secretary signature lines.
// @route   POST /api/admin/general-certificate/generate
// @access  Private
exports.generateCertificate = async (req, res) => {
  let page;
  try {
    const b = req.body || {};
    const isMalayalam = b.certificate_language === 'ml';

    const tenant = await Tenant.findById(req.user.tenant_id).select('name nameMalayalam address addressMalayalam regNo');
    const tenantAddress = isMalayalam ? (tenant?.addressMalayalam || tenant?.address) : tenant?.address;

    const v = (x) => x || '-';

    const data = {
      mahallu_name: tenant?.name || 'Mahallu',
      mahallu_name_malayalam: tenant?.nameMalayalam || tenant?.name || '',
      mahallu_address: v(tenantAddress),
      mahallu_reg_no: v(tenant?.regNo),
      certificate_no: b.certificate_no || '',
      date: fmtDate(new Date()),
      title: v(b.title),
      body: v(b.body)
    };

    const tplFile = isMalayalam ? 'generalCertificate.html' : 'generalCertificateEn.html';
    const html = fillTemplate(fs.readFileSync(path.join(__dirname, '../templates', tplFile), 'utf8'), data);

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

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="General_Certificate.pdf"');
    res.send(pdfBuffer);
  } catch (err) {
    console.error('Error generating general certificate PDF:', err);
    res.status(500).json({ message: err.message });
  } finally {
    if (page) await page.close();
  }
};
