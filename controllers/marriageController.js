const Marriage = require('../models/Marriage');
const Tenant = require('../models/Tenant');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');
const fs = require('fs');
const path = require('path');

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

// Helper: word-wrap text to fit within maxWidth (handles embedded newlines)
const wrapText = (str, maxWidth, size, f) => {
  if (!str || str === '-') return [str || '-'];
  // Split on newlines first, then word-wrap each segment
  const segments = String(str).replace(/\r\n/g, '\n').split('\n');
  const lines = [];
  for (const seg of segments) {
    const words = seg.split(' ');
    let line = '';
    for (const w of words) {
      if (!w) continue;
      const test = line ? `${line} ${w}` : w;
      if (f.widthOfTextAtSize(test, size) > maxWidth && line) {
        lines.push(line);
        line = w;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
  }
  return lines.length ? lines : ['-'];
};

// Generate PDF by drawing onto the PDF template
const generateMarriagePDF = async (marriage) => {
  try {
    const tenant = await Tenant.findById(marriage.tenant_id).select('name');
    const mahalluName = tenant?.name || 'Mahallu';

    const v     = (x) => x || '-';
    const da    = (dob) => dobAge(dob, marriage.date);
    const iDate = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const nDate = fmtDate(marriage.date);

    // ── Load template ──
    const tplBytes = fs.readFileSync(path.join(__dirname, '../templates/marriageTemplate.pdf'));
    const pdfDoc   = await PDFDocument.load(tplBytes);
    pdfDoc.registerFontkit(fontkit);
    const page     = pdfDoc.getPages()[0];
    const { width } = page.getSize(); // 595.276 × 841.89

    // ── Fonts (Georgia — system TTF, full glyph set) ──
    const sysF      = '/System/Library/Fonts/Supplemental';
    const fReg      = await pdfDoc.embedFont(fs.readFileSync(`${sysF}/Georgia.ttf`));
    const fBold     = await pdfDoc.embedFont(fs.readFileSync(`${sysF}/Georgia Bold.ttf`));
    const fItal     = await pdfDoc.embedFont(fs.readFileSync(`${sysF}/Georgia Italic.ttf`));
    const fBoldItal = await pdfDoc.embedFont(fs.readFileSync(`${sysF}/Georgia Bold Italic.ttf`));

    // ── Colours ──
    const cBlack   = rgb(0.08, 0.08, 0.08);
    const cDarkRed = rgb(0.52, 0.07, 0.07);
    const cGray    = rgb(0.38, 0.38, 0.38);
    const cAccent  = rgb(0.65, 0.40, 0.30);

    // ── Layout: narrower margins to avoid border overlap ──
    const L  = 95;
    const R  = width - 95;
    const CW = R - L;   // ≈ 405 pt

    // ── Primitives ──
    const tx = (str, x, y, size, f = fReg, color = cBlack) =>
      page.drawText(String(str || '-'), { x, y, size, font: f, color });

    const ctrX = (str, size, f = fReg) =>
      (width - f.widthOfTextAtSize(str, size)) / 2;

    const hLine = (y, x1 = L, x2 = R, t = 0.6, color = cAccent) =>
      page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness: t, color });

    // ── Dynamic y cursor ──
    let cy = 0; // set per section below

    const KW  = 110; // key column width (pt)
    const FS  = 8.5; // base font size
    const ROW = 14;  // normal row gap
    const LH  = 11;  // wrapped extra line height

    // Draw "Key  :  Value", advance cy, return lines used
    const kv = (key, val) => {
      tx(key, L, cy, FS, fBold, cGray);
      tx(':', L + KW, cy, FS, fBold, cGray);
      const valX = L + KW + 9;
      const valW = R - valX;
      const lines = wrapText(String(val || '-'), valW, FS, fReg);
      lines.forEach((ln, i) => tx(ln, valX, cy - i * LH, FS, fReg, cBlack));
      cy -= ROW + (lines.length - 1) * LH;
    };

    // Section heading with flanking lines
    const sectionHead = (title) => {
      cy -= 6;
      const tw  = fBold.widthOfTextAtSize(title, 10);
      const mid = width / 2;
      tx(title, mid - tw / 2, cy, 10, fBold, cDarkRed);
      hLine(cy + 4, L, mid - tw / 2 - 6, 0.7, cDarkRed);
      hLine(cy + 4, mid + tw / 2 + 6, R, 0.7, cDarkRed);
      cy -= 18;
    };

    // ════════════════════════════════════════
    // HEADER  (between template's two ornamental lines)
    // ════════════════════════════════════════

    // ── Mahallu name: double flanking lines + filled circle ornaments ──
    const orgStr = mahalluName.toUpperCase();
    const orgFS  = 14;
    const orgW   = fBold.widthOfTextAtSize(orgStr, orgFS);
    const orgX   = (width - orgW) / 2;
    const orgY   = 750;
    const lineY  = orgY + 6;

    // Left: thick line + thin line below + filled dot at end
    hLine(lineY,     L,           orgX - 12, 1.2, cDarkRed);
    hLine(lineY - 3, L,           orgX - 12, 0.4, rgb(0.65, 0.20, 0.20));
    page.drawEllipse({ x: orgX - 7, y: lineY - 1.5, xScale: 3.5, yScale: 3.5, color: cDarkRed });

    tx(orgStr, orgX, orgY, orgFS, fBold, cDarkRed);

    // Right: same mirrored
    hLine(lineY,     orgX + orgW + 12, R, 1.2, cDarkRed);
    hLine(lineY - 3, orgX + orgW + 12, R, 0.4, rgb(0.65, 0.20, 0.20));
    page.drawEllipse({ x: orgX + orgW + 7, y: lineY - 1.5, xScale: 3.5, yScale: 3.5, color: cDarkRed });

    // Subtle thin underline beneath org name
    hLine(orgY - 2, orgX + 4, orgX + orgW - 4, 0.4, rgb(0.65, 0.20, 0.20));

    // ── Certificate of Marriage: bold-italic, double underline ──
    const titleStr = 'Certificate of Marriage';
    const titleW   = fBoldItal.widthOfTextAtSize(titleStr, 12);
    const titleX   = (width - titleW) / 2;
    const titleY   = 727;
    tx(titleStr, titleX, titleY, 12, fBoldItal, cBlack);
    hLine(titleY - 2.5, titleX,      titleX + titleW,      1.0, cBlack);
    hLine(titleY - 5.5, titleX + 12, titleX + titleW - 12, 0.4, cGray);

    // ════════════════════════════════════════
    // CERT INFO BAR  (styled box: No. + Date of Issue)
    // ════════════════════════════════════════
    const barH   = 16;
    const barBot = 686;
    const barTop = barBot + barH;

    page.drawRectangle({ x: L, y: barBot, width: CW, height: barH, color: rgb(0.97, 0.93, 0.89) });
    hLine(barTop, L, R, 1.2, cDarkRed);
    hLine(barBot, L, R, 0.6, cDarkRed);
    // Thin inner accent line just below top border
    hLine(barTop - 2.5, L, R, 0.3, rgb(0.75, 0.40, 0.30));
    // Center vertical divider
    page.drawLine({ start: { x: width / 2, y: barBot + 2 }, end: { x: width / 2, y: barTop - 2 }, thickness: 0.5, color: cAccent });

    tx(`No. ${marriage.certificate_no}`, L + 7, barBot + 5, 8, fBold, cDarkRed);
    const idStr = `Date of Issue : ${iDate}`;
    tx(idStr, R - fBold.widthOfTextAtSize(idStr, 8) - 7, barBot + 5, 8, fBold, cDarkRed);

    // ── Subtitle ──
    const sub = `This is to certify that the following Nikkah has been solemnized and recorded in the Marriage Register maintained by ${mahalluName}.`;
    const subLines = wrapText(sub, CW, 7.5, fItal);
    const subY0 = barBot - 13;
    subLines.forEach((ln, i) => tx(ln, ctrX(ln, 7.5, fItal), subY0 - i * 10, 7.5, fItal, cGray));

    // ── Triple decorative divider ──
    const divY = subY0 - subLines.length * 10 - 7;
    hLine(divY + 4, L,      R,      0.4, cAccent);
    hLine(divY,     L + 8,  R - 8,  1.8, cDarkRed);
    hLine(divY - 4, L,      R,      0.4, cAccent);

    // ════════════════════════════════════════
    // NIKKAH DETAILS  (2 × 2 key-value grid)
    // ════════════════════════════════════════
    const half = CW / 2;
    const L2   = L + half + 8;
    const KW2  = 72;

    const kv2 = (key, val, ox) => {
      tx(key, ox, cy, 7.5, fBold, cGray);
      tx(':', ox + KW2, cy, 7.5, fBold, cGray);
      tx(String(val || '-'), ox + KW2 + 7, cy, 7.5, fReg, cBlack);
    };

    cy = divY - 16;
    kv2('Date of Nikkah',  nDate,                      L);
    kv2('Time',            v(marriage.nikkah_time),     L2);
    cy -= 14;
    kv2('Place of Nikkah', v(marriage.place),           L);
    kv2('Nikkah Mahallu',  v(marriage.nikkah_mahallu),  L2);

    hLine(cy - 8, L, R, 0.7, cAccent);

    // ════════════════════════════════════════
    // HUSBAND DETAILS
    // ════════════════════════════════════════
    cy -= 22;
    sectionHead('Husband Details');
    kv('Full Name',          v(marriage.groom_name));
    kv('Age and DOB',        da(marriage.groom_dob));
    kv('Father Name',        v(marriage.groom_father));
    kv('House Name',         v(marriage.groom_house_name));
    kv('Mahallu',            v(marriage.groom_mahallu));
    kv('Permanent Address',  v(marriage.groom_address));

    hLine(cy - 6, L, R, 0.7, cAccent);

    // ════════════════════════════════════════
    // WIFE DETAILS
    // ════════════════════════════════════════
    cy -= 20;
    sectionHead('Wife Details');
    kv('Full Name',          v(marriage.bride_name));
    kv('Age and DOB',        da(marriage.bride_dob));
    kv('Father Name',        v(marriage.bride_father));
    kv('House Name',         v(marriage.bride_house_name));
    kv('Mahallu',            v(marriage.bride_mahallu));
    kv('Permanent Address',  v(marriage.bride_address));

    hLine(cy - 6, L, R, 0.7, cAccent);

    // ════════════════════════════════════════
    // PERFORMER
    // ════════════════════════════════════════
    cy -= 18;
    kv('Performer of Nikkah', v(marriage.performer_name));
    kv('Designation',         v(marriage.performer_designation));

    // ════════════════════════════════════════
    // BOTTOM INFO
    // ════════════════════════════════════════
    cy -= 4;
    hLine(cy, L, R, 0.5, cAccent);
    cy -= 12;
    tx(`Marriage ID : ${marriage.marriage_id}`, L, cy, 7.5, fReg, cGray);
    const cnStr = `Certificate No : ${marriage.certificate_no}`;
    tx(cnStr, R - fReg.widthOfTextAtSize(cnStr, 7.5), cy, 7.5, fReg, cGray);

    // ════════════════════════════════════════
    // SIGNATURE  (bottom-right) + blank seal space (bottom-left)
    // ════════════════════════════════════════
    const sigY  = cy - 55;
    const sealY = sigY - 8;   // vertical centre of the blank seal space

    // "Seal" label — light dotted placeholder so the printer knows where to stamp
    const sealLbl = '[ Seal ]';
    const sealLblW = fItal.widthOfTextAtSize(sealLbl, 7);
    tx(sealLbl, L + 58 - sealLblW / 2, sealY - 40, 7, fItal, rgb(0.75, 0.75, 0.75));

    const sigX1 = R - 150;
    hLine(sigY, sigX1, R, 0.8, cBlack);
    const slbl = 'Authorized Signatory';
    tx(slbl, sigX1 + (150 - fBold.widthOfTextAtSize(slbl, 8)) / 2, sigY - 11, 8, fBold, cBlack);
    tx(mahalluName, sigX1 + (150 - fReg.widthOfTextAtSize(mahalluName, 7.5)) / 2, sigY - 22, 7.5, fReg, cGray);

    // Disclaimer
    const disc = `This is an official certificate issued by ${mahalluName}. Valid for all official purposes.`;
    tx(disc, ctrX(disc, 6.5, fItal), sealY - 56, 6.5, fItal, rgb(0.55, 0.55, 0.55));

    // ════════════════════════════════════════
    // SAVE
    // ════════════════════════════════════════
    const pdfDir = path.join(__dirname, '../public/certificates');
    if (!fs.existsSync(pdfDir)) fs.mkdirSync(pdfDir, { recursive: true });
    const pdfBytes = await pdfDoc.save();
    fs.writeFileSync(path.join(pdfDir, `${marriage.certificate_no}.pdf`), pdfBytes);

    return `/certificates/${marriage.certificate_no}.pdf`;
  } catch (error) {
    console.error('Error generating PDF:', error);
    throw error;
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
      mobile, notes
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
      mobile, notes
    } = req.body;

    const marriage = await Marriage.findOneAndUpdate(
      { _id: req.params.id, tenant_id: req.user.tenant_id },
      {
        groom_name, groom_father, groom_dob, groom_house_name, groom_mahallu, groom_address,
        bride_name, bride_father, bride_dob, bride_house_name, bride_mahallu, bride_address,
        date, nikkah_time, place, nikkah_mahallu,
        performer_name, performer_designation,
        mobile, notes
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
