const mongoose = require('mongoose');
const Surah    = require('../models/Surah');
const Dua      = require('../models/Dua');
const Tenant   = require('../models/Tenant');
const { uploadToR2, deleteFromR2ByUrl } = require('../utils/r2Client');

// ── helpers ──────────────────────────────────────────────────────────────────
const resolveTenant = (slug) =>
  slug ? Tenant.findOne({ slug: slug.toLowerCase(), status: 'active' }) : null;

// Uploads a Surah/Dua PDF to R2 under a tenant-scoped folder and returns the public URL.
// No `downloadName` here (unlike certificates/receipts) — these PDFs are meant
// to be read inline via the built-in viewer, not downloaded, so we don't want
// Content-Disposition: attachment forcing a download instead of rendering.
const uploadIslamicPdf = async (tenant_id, type, file) => {
  const tenant = await Tenant.findById(tenant_id).select('slug');
  const tenantFolder = tenant?.slug || tenant_id.toString();
  const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
  const key = `islamic-library/${tenantFolder}/${type}/${Date.now()}_${safeName}`;
  return uploadToR2(key, file.buffer, {
    contentType: file.mimetype
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// SURAH — ADMIN
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/islamic-library/surah
exports.createSurah = async (req, res) => {
  try {
    const { title, arabic_title, description, display_order, is_featured } = req.body;
    if (!title) return res.status(400).json({ message: 'Title is required' });

    const pdf_file = req.file ? await uploadIslamicPdf(req.user.tenant_id, 'surah', req.file) : '';

    const surah = await Surah.create({
      tenant_id:     req.user.tenant_id,
      title,
      arabic_title:  arabic_title || '',
      description:   description  || '',
      pdf_file,
      display_order: Number(display_order) || 0,
      is_featured:   is_featured === 'true' || is_featured === true,
      is_published:  false,
      created_by:    req.user.id,
    });

    res.status(201).json({ message: 'Surah created', surah });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};

// GET /api/islamic-library/surah
exports.listSurahs = async (req, res) => {
  try {
    const { page = 1, limit = 20, search = '' } = req.query;
    const query = { tenant_id: req.user.tenant_id, is_active: true };
    if (search) query.title = { $regex: search, $options: 'i' };

    const [surahs, total] = await Promise.all([
      Surah.find(query)
        .sort({ display_order: 1, created_at: -1 })
        .skip((Number(page) - 1) * Number(limit))
        .limit(Number(limit)),
      Surah.countDocuments(query),
    ]);

    res.json({ surahs, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PUT /api/islamic-library/surah/:id
exports.updateSurah = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, arabic_title, description, display_order, is_featured, is_published } = req.body;

    const surah = await Surah.findOne({ _id: id, tenant_id: req.user.tenant_id, is_active: true });
    if (!surah) return res.status(404).json({ message: 'Surah not found' });

    // Replace PDF if new file uploaded
    if (req.file) {
      const oldUrl = surah.pdf_file;
      surah.pdf_file = await uploadIslamicPdf(req.user.tenant_id, 'surah', req.file);
      await deleteFromR2ByUrl(oldUrl);
    }

    if (title        !== undefined) surah.title         = title;
    if (arabic_title !== undefined) surah.arabic_title  = arabic_title;
    if (description  !== undefined) surah.description   = description;
    if (display_order!== undefined) surah.display_order = Number(display_order);
    if (is_featured  !== undefined) surah.is_featured   = is_featured === 'true' || is_featured === true;
    if (is_published !== undefined) surah.is_published  = is_published === 'true' || is_published === true;
    surah.updated_by = req.user.id;

    await surah.save();
    res.json({ message: 'Surah updated', surah });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// DELETE /api/islamic-library/surah/:id
exports.deleteSurah = async (req, res) => {
  try {
    const surah = await Surah.findOneAndDelete(
      { _id: req.params.id, tenant_id: req.user.tenant_id }
    );
    if (!surah) return res.status(404).json({ message: 'Surah not found' });
    await deleteFromR2ByUrl(surah.pdf_file);
    res.json({ message: 'Surah deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// DUA — ADMIN
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/islamic-library/dua
exports.createDua = async (req, res) => {
  try {
    const { title, category, description, display_order, is_featured } = req.body;
    if (!title) return res.status(400).json({ message: 'Title is required' });

    const pdf_file = req.file ? await uploadIslamicPdf(req.user.tenant_id, 'dua', req.file) : '';

    const dua = await Dua.create({
      tenant_id:     req.user.tenant_id,
      title,
      category:      category    || 'General',
      description:   description || '',
      pdf_file,
      display_order: Number(display_order) || 0,
      is_featured:   is_featured === 'true' || is_featured === true,
      is_published:  false,
      created_by:    req.user.id,
    });

    res.status(201).json({ message: 'Dua created', dua });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};

// GET /api/islamic-library/dua
exports.listDuas = async (req, res) => {
  try {
    const { page = 1, limit = 20, search = '', category } = req.query;
    const query = { tenant_id: req.user.tenant_id, is_active: true };
    if (search)   query.title    = { $regex: search, $options: 'i' };
    if (category) query.category = category;

    const [duas, total] = await Promise.all([
      Dua.find(query)
        .sort({ display_order: 1, created_at: -1 })
        .skip((Number(page) - 1) * Number(limit))
        .limit(Number(limit)),
      Dua.countDocuments(query),
    ]);

    res.json({ duas, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PUT /api/islamic-library/dua/:id
exports.updateDua = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, category, description, display_order, is_featured, is_published } = req.body;

    const dua = await Dua.findOne({ _id: id, tenant_id: req.user.tenant_id, is_active: true });
    if (!dua) return res.status(404).json({ message: 'Dua not found' });

    if (req.file) {
      const oldUrl = dua.pdf_file;
      dua.pdf_file = await uploadIslamicPdf(req.user.tenant_id, 'dua', req.file);
      await deleteFromR2ByUrl(oldUrl);
    }

    if (title        !== undefined) dua.title         = title;
    if (category     !== undefined) dua.category      = category;
    if (description  !== undefined) dua.description   = description;
    if (display_order!== undefined) dua.display_order = Number(display_order);
    if (is_featured  !== undefined) dua.is_featured   = is_featured === 'true' || is_featured === true;
    if (is_published !== undefined) dua.is_published  = is_published === 'true' || is_published === true;
    dua.updated_by = req.user.id;

    await dua.save();
    res.json({ message: 'Dua updated', dua });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// DELETE /api/islamic-library/dua/:id
exports.deleteDua = async (req, res) => {
  try {
    const dua = await Dua.findOneAndDelete(
      { _id: req.params.id, tenant_id: req.user.tenant_id }
    );
    if (!dua) return res.status(404).json({ message: 'Dua not found' });
    await deleteFromR2ByUrl(dua.pdf_file);
    res.json({ message: 'Dua deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC (no auth)
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/islamic-library/public/surahs?t=slug&search=
exports.getPublicSurahs = async (req, res) => {
  try {
    const tenant = await resolveTenant(req.query.t);
    if (!tenant) return res.status(404).json({ message: 'Mahallu not found' });

    const query = { tenant_id: tenant._id, is_active: true, is_published: true };
    if (req.query.search) query.title = { $regex: req.query.search, $options: 'i' };

    const surahs = await Surah.find(query)
      .select('title arabic_title description pdf_file display_order is_featured')
      .sort({ display_order: 1, created_at: 1 });

    res.json({ data: surahs });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/islamic-library/public/duas?t=slug&search=&category=
exports.getPublicDuas = async (req, res) => {
  try {
    const tenant = await resolveTenant(req.query.t);
    if (!tenant) return res.status(404).json({ message: 'Mahallu not found' });

    const query = { tenant_id: tenant._id, is_active: true, is_published: true };
    if (req.query.search)   query.title    = { $regex: req.query.search, $options: 'i' };
    if (req.query.category) query.category = req.query.category;

    const duas = await Dua.find(query)
      .select('title category description pdf_file display_order is_featured')
      .sort({ display_order: 1, created_at: 1 });

    res.json({ data: duas });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
