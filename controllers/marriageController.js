const Marriage = require('../models/Marriage');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// Helper function to generate marriage ID
const generateMarriageId = async (tenant_id) => {
  const count = await Marriage.countDocuments({ tenant_id });
  const paddedCount = String(count + 1).padStart(3, '0');
  return `MRG-${paddedCount}`;
};

// Helper function to generate certificate number
const generateCertificateNo = async (tenant_id) => {
  const count = await Marriage.countDocuments({ tenant_id });
  const paddedCount = String(count + 1).padStart(3, '0');
  return `CERT-${paddedCount}`;
};

// Helper function to generate PDF
const generateMarriagePDF = async (marriage) => {
  try {
    console.log('Starting PDF generation for:', marriage.certificate_no);
    
    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    console.log('Puppeteer browser launched');
    
    const page = await browser.newPage();
    console.log('New page created');

    // Read HTML template
    const templatePath = path.join(__dirname, '../templates/marriageCertificate.html');
    console.log('Template path:', templatePath);
    let html = fs.readFileSync(templatePath, 'utf8');
    console.log('Template read successfully');

    // Format date
    const formattedDate = new Date(marriage.date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    // Replace placeholders
    html = html.replace(/{{marriage_id}}/g, marriage.marriage_id);
    html = html.replace(/{{certificate_no}}/g, marriage.certificate_no);
    html = html.replace(/{{groom_name}}/g, marriage.groom_name);
    html = html.replace(/{{groom_father}}/g, marriage.groom_father);
    html = html.replace(/{{bride_name}}/g, marriage.bride_name);
    html = html.replace(/{{bride_father}}/g, marriage.bride_father);
    html = html.replace(/{{date}}/g, formattedDate);
    html = html.replace(/{{place}}/g, marriage.place);
    html = html.replace(/{{mobile}}/g, marriage.mobile);
    console.log('Placeholders replaced');

    // Set content
    await page.setContent(html, { waitUntil: 'domcontentloaded' });
    console.log('Content set');

    // Create PDF directory if it doesn't exist
    const pdfDir = path.join(__dirname, '../public/certificates');
    if (!fs.existsSync(pdfDir)) {
      fs.mkdirSync(pdfDir, { recursive: true });
    }
    console.log('PDF directory ready:', pdfDir);

    // Generate PDF
    const pdfPath = path.join(pdfDir, `${marriage.certificate_no}.pdf`);
    console.log('Generating PDF at:', pdfPath);
    
    await page.pdf({
      path: pdfPath,
      format: 'A4',
      landscape: true,
      printBackground: true,
      margin: {
        top: '20px',
        right: '20px',
        bottom: '20px',
        left: '20px'
      }
    });
    console.log('PDF generated successfully');

    await browser.close();
    console.log('Browser closed');

    // Return relative URL
    return `/certificates/${marriage.certificate_no}.pdf`;
  } catch (error) {
    console.error('Error generating PDF:', error);
    console.error('Error stack:', error.stack);
    throw error;
  }
};

// @desc    Create marriage record (admin)
// @route   POST /api/admin/marriages/create
// @access  Private
exports.createMarriage = async (req, res) => {
  try {
    const {
      groom_name,
      groom_father,
      bride_name,
      bride_father,
      date,
      place,
      mobile,
      notes
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
      groom_name,
      groom_father,
      bride_name,
      bride_father,
      date,
      place,
      mobile,
      notes,
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
      groom_name,
      groom_father,
      bride_name,
      bride_father,
      date,
      place,
      mobile,
      notes
    } = req.body;

    const marriage = await Marriage.findOneAndUpdate(
      {
        _id: req.params.id,
        tenant_id: req.user.tenant_id
      },
      {
        groom_name,
        groom_father,
        bride_name,
        bride_father,
        date,
        place,
        mobile,
        notes
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
