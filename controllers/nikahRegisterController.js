const Tenant = require('../models/Tenant');
const fs = require('fs');
const path = require('path');
const { fillTemplate, getBrowser } = require('../utils/pdfTemplate');

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '';

// @desc    Generate a Nikah Register form PDF on the fly (no record is stored).
//          The org/header details come from the requesting user's tenant; the
//          witness, guardian, mahr and signature areas are intentionally left
//          blank on the PDF for hand-filling after printing.
// @route   POST /api/admin/nikah-register/generate
// @access  Private
exports.generateRegister = async (req, res) => {
  let page;
  try {
    const tenant = await Tenant.findById(req.user.tenant_id).select('name nameMalayalam address addressMalayalam regNo');
    const orgName = tenant?.nameMalayalam || tenant?.name || 'Mahallu';
    const orgAddress = tenant?.addressMalayalam || tenant?.address || '';
    const orgRegNo = tenant?.regNo || '';

    const b = req.body || {};
    const party = b.our_party === 'bride' ? 'bride' : 'groom';

    const data = {
      register_no: b.register_no || '',
      org_name: orgName,
      org_address: orgAddress,
      org_reg_no: orgRegNo,
      date: fmtDate(new Date()),
      groom_check: party === 'groom' ? '✓' : '',
      bride_check: party === 'bride' ? '✓' : '',

      groom_name: b.groom_name || '',
      groom_father: b.groom_father || '',
      groom_mother: b.groom_mother || '',
      groom_house: b.groom_house || '',
      groom_mahallu: b.groom_mahallu || '',
      groom_address: b.groom_address || '',
      groom_nikkah_count: b.groom_nikkah_count || '',
      groom_prev_nikkah: b.groom_prev_nikkah || '',

      bride_name: b.bride_name || '',
      bride_father: b.bride_father || '',
      bride_mother: b.bride_mother || '',
      bride_house: b.bride_house || '',
      bride_mahallu: b.bride_mahallu || '',
      bride_address: b.bride_address || '',
      bride_nikkah_count: b.bride_nikkah_count || '',
      bride_prev_nikkah: b.bride_prev_nikkah || '',

      nikah_date: fmtDate(b.nikah_date),
      nikah_place: b.nikah_place || '',
      nikah_performer: b.nikah_performer || '',
      mobile: b.mobile || ''
    };

    const tplPath = path.join(__dirname, '../templates/nikahRegister.html');
    const html = fillTemplate(fs.readFileSync(tplPath, 'utf8'), data);

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
    res.setHeader('Content-Disposition', 'inline; filename="Nikah_Register.pdf"');
    res.send(pdfBuffer);
  } catch (err) {
    console.error('Error generating Nikah Register PDF:', err);
    res.status(500).json({ message: err.message });
  } finally {
    if (page) await page.close();
  }
};
