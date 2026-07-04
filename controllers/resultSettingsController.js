const Madrasa = require('../models/Madrasa');
const MadrasaClass = require('../models/MadrasaClass');
const MadrasaSubject = require('../models/MadrasaSubject');
const ResultType = require('../models/ResultType');
const AcademicYear = require('../models/AcademicYear');

const pad = (n, len) => String(n).padStart(len, '0');

const genCode = async (Model, tenant_id, prefix, digits = 3) => {
    const docs = await Model.find({ tenant_id, code: { $regex: `^${prefix}-` } }).select('code');
    const nums = docs.map(d => parseInt((d.code || '').replace(`${prefix}-`, ''), 10)).filter(n => !isNaN(n));
    const num = nums.length ? Math.max(...nums) : 0;
    return `${prefix}-${pad(num + 1, digits)}`;
};

/* ─── MADRASA ─── */

exports.createMadrasa = async (req, res) => {
    try {
        const { name, type, status } = req.body;
        if (!name) return res.status(400).json({ message: 'Name is required' });
        const code = await genCode(Madrasa, req.user.tenant_id, 'MDR');
        const doc = await Madrasa.create({ tenant_id: req.user.tenant_id, code, name, type, status, created_by: req.user.id });
        res.status(201).json({ message: 'Madrasa created', madrasa: doc });
    } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.getMadrasas = async (req, res) => {
    try {
        const { page = 1, limit = 20, search, status } = req.query;
        const query = { tenant_id: req.user.tenant_id, is_active: true };
        if (search) query.$or = [{ name: { $regex: search, $options: 'i' } }, { code: { $regex: search, $options: 'i' } }];
        if (status) query.status = status;
        const skip = (page - 1) * limit;
        const [madrasas, total] = await Promise.all([
            Madrasa.find(query).sort({ name: 1 }).skip(skip).limit(Number(limit)),
            Madrasa.countDocuments(query),
        ]);
        res.json({ madrasas, total, page: Number(page), pages: Math.ceil(total / limit) });
    } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.getMadrasasForSelect = async (req, res) => {
    try {
        const madrasas = await Madrasa.find({ tenant_id: req.user.tenant_id, is_active: true, status: 'active' }).select('_id name code').sort({ name: 1 });
        res.json({ madrasas });
    } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.updateMadrasa = async (req, res) => {
    try {
        const doc = await Madrasa.findOneAndUpdate(
            { _id: req.params.id, tenant_id: req.user.tenant_id },
            { ...req.body, updated_by: req.user.id },
            { new: true }
        );
        if (!doc) return res.status(404).json({ message: 'Not found' });
        res.json({ message: 'Madrasa updated', madrasa: doc });
    } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.deleteMadrasa = async (req, res) => {
    try {
        const tenant_id = req.user.tenant_id;
        // Cascade hard delete: owned subjects & classes → madrasa
        await MadrasaSubject.deleteMany({ madrasa_id: req.params.id, tenant_id });
        await MadrasaClass.deleteMany({ madrasa_id: req.params.id, tenant_id });
        await Madrasa.deleteOne({ _id: req.params.id, tenant_id });
        res.json({ message: 'Madrasa deleted' });
    } catch (err) { res.status(500).json({ message: err.message }); }
};

/* ─── CLASS ─── */

exports.createClass = async (req, res) => {
    try {
        const { madrasa_id, name, status } = req.body;
        if (!name) return res.status(400).json({ message: 'Name is required' });
        if (!madrasa_id) return res.status(400).json({ message: 'Madrasa is required' });
        const code = await genCode(MadrasaClass, req.user.tenant_id, 'CLS');
        const doc = await MadrasaClass.create({ tenant_id: req.user.tenant_id, madrasa_id, code, name, status, created_by: req.user.id });
        res.status(201).json({ message: 'Class created', class: doc });
    } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.getClasses = async (req, res) => {
    try {
        const { page = 1, limit = 20, search, madrasa_id, status } = req.query;
        const query = { tenant_id: req.user.tenant_id, is_active: true };
        if (search) query.$or = [{ name: { $regex: search, $options: 'i' } }, { code: { $regex: search, $options: 'i' } }];
        if (madrasa_id) query.madrasa_id = madrasa_id;
        if (status) query.status = status;
        const skip = (page - 1) * limit;
        const [classes, total] = await Promise.all([
            MadrasaClass.find(query).populate('madrasa_id', 'name code').sort({ name: 1 }).skip(skip).limit(Number(limit)),
            MadrasaClass.countDocuments(query),
        ]);
        res.json({ classes, total, page: Number(page), pages: Math.ceil(total / limit) });
    } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.updateClass = async (req, res) => {
    try {
        const doc = await MadrasaClass.findOneAndUpdate(
            { _id: req.params.id, tenant_id: req.user.tenant_id },
            { ...req.body, updated_by: req.user.id },
            { new: true }
        );
        if (!doc) return res.status(404).json({ message: 'Not found' });
        res.json({ message: 'Class updated', class: doc });
    } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.deleteClass = async (req, res) => {
    try {
        const tenant_id = req.user.tenant_id;
        // Cascade hard delete: owned subjects → class
        await MadrasaSubject.deleteMany({ class_id: req.params.id, tenant_id });
        await MadrasaClass.deleteOne({ _id: req.params.id, tenant_id });
        res.json({ message: 'Class deleted' });
    } catch (err) { res.status(500).json({ message: err.message }); }
};

/* ─── SUBJECT ─── */

exports.createSubject = async (req, res) => {
    try {
        const { madrasa_id, class_id, name, short_name, status } = req.body;
        if (!name) return res.status(400).json({ message: 'Name is required' });
        if (!madrasa_id) return res.status(400).json({ message: 'Madrasa is required' });
        if (!class_id) return res.status(400).json({ message: 'Class is required' });
        const code = await genCode(MadrasaSubject, req.user.tenant_id, 'SUB');
        const doc = await MadrasaSubject.create({ tenant_id: req.user.tenant_id, madrasa_id, class_id, code, name, short_name, status, created_by: req.user.id });
        res.status(201).json({ message: 'Subject created', subject: doc });
    } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.getSubjects = async (req, res) => {
    try {
        const { page = 1, limit = 20, search, madrasa_id, class_id, status } = req.query;
        const query = { tenant_id: req.user.tenant_id, is_active: true };
        if (search) query.$or = [{ name: { $regex: search, $options: 'i' } }, { code: { $regex: search, $options: 'i' } }];
        if (madrasa_id) query.madrasa_id = madrasa_id;
        if (class_id) query.class_id = class_id;
        if (status) query.status = status;
        const skip = (page - 1) * limit;
        const [subjects, total] = await Promise.all([
            MadrasaSubject.find(query).populate('madrasa_id', 'name code').populate('class_id', 'name code').sort({ name: 1 }).skip(skip).limit(Number(limit)),
            MadrasaSubject.countDocuments(query),
        ]);
        res.json({ subjects, total, page: Number(page), pages: Math.ceil(total / limit) });
    } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.updateSubject = async (req, res) => {
    try {
        const doc = await MadrasaSubject.findOneAndUpdate(
            { _id: req.params.id, tenant_id: req.user.tenant_id },
            { ...req.body, updated_by: req.user.id },
            { new: true }
        );
        if (!doc) return res.status(404).json({ message: 'Not found' });
        res.json({ message: 'Subject updated', subject: doc });
    } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.deleteSubject = async (req, res) => {
    try {
        await MadrasaSubject.deleteOne({ _id: req.params.id, tenant_id: req.user.tenant_id });
        res.json({ message: 'Subject deleted' });
    } catch (err) { res.status(500).json({ message: err.message }); }
};

/* ─── RESULT TYPE ─── */

exports.createResultType = async (req, res) => {
    try {
        const { name, status } = req.body;
        if (!name) return res.status(400).json({ message: 'Name is required' });
        const code = await genCode(ResultType, req.user.tenant_id, 'RT');
        const doc = await ResultType.create({ tenant_id: req.user.tenant_id, code, name, status, created_by: req.user.id });
        res.status(201).json({ message: 'Result type created', resultType: doc });
    } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.getResultTypes = async (req, res) => {
    try {
        const { page = 1, limit = 20, search, status } = req.query;
        const query = { tenant_id: req.user.tenant_id, is_active: true };
        if (search) query.$or = [{ name: { $regex: search, $options: 'i' } }, { code: { $regex: search, $options: 'i' } }];
        if (status) query.status = status;
        const skip = (page - 1) * limit;
        const [resultTypes, total] = await Promise.all([
            ResultType.find(query).sort({ name: 1 }).skip(skip).limit(Number(limit)),
            ResultType.countDocuments(query),
        ]);
        res.json({ resultTypes, total, page: Number(page), pages: Math.ceil(total / limit) });
    } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.updateResultType = async (req, res) => {
    try {
        const doc = await ResultType.findOneAndUpdate(
            { _id: req.params.id, tenant_id: req.user.tenant_id },
            { ...req.body, updated_by: req.user.id },
            { new: true }
        );
        if (!doc) return res.status(404).json({ message: 'Not found' });
        res.json({ message: 'Result type updated', resultType: doc });
    } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.deleteResultType = async (req, res) => {
    try {
        await ResultType.deleteOne({ _id: req.params.id, tenant_id: req.user.tenant_id });
        res.json({ message: 'Result type deleted' });
    } catch (err) { res.status(500).json({ message: err.message }); }
};

/* ─── ACADEMIC YEAR ─── */

exports.createAcademicYear = async (req, res) => {
    try {
        const { name, status } = req.body;
        if (!name) return res.status(400).json({ message: 'Name is required' });
        const exists = await AcademicYear.findOne({ tenant_id: req.user.tenant_id, name: name.trim(), is_active: true });
        if (exists) return res.status(400).json({ message: `Academic year "${name.trim()}" already exists` });
        const code = await genCode(AcademicYear, req.user.tenant_id, 'AY');
        const doc = await AcademicYear.create({ tenant_id: req.user.tenant_id, code, name, status, created_by: req.user.id });
        res.status(201).json({ message: 'Academic year created', academicYear: doc });
    } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.getAcademicYears = async (req, res) => {
    try {
        const { page = 1, limit = 20, search, status } = req.query;
        const query = { tenant_id: req.user.tenant_id, is_active: true };
        if (search) query.$or = [{ name: { $regex: search, $options: 'i' } }, { code: { $regex: search, $options: 'i' } }];
        if (status) query.status = status;
        const skip = (page - 1) * limit;
        const [academicYears, total] = await Promise.all([
            AcademicYear.find(query).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
            AcademicYear.countDocuments(query),
        ]);
        res.json({ academicYears, total, page: Number(page), pages: Math.ceil(total / limit) });
    } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.getAcademicYearsForSelect = async (req, res) => {
    try {
        const query = { tenant_id: req.user.tenant_id, is_active: true, status: 'active' };
        const academicYears = await AcademicYear.find(query).select('_id name code').sort({ createdAt: -1 });
        res.json({ academicYears });
    } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.updateAcademicYear = async (req, res) => {
    try {
        const doc = await AcademicYear.findOneAndUpdate(
            { _id: req.params.id, tenant_id: req.user.tenant_id },
            { ...req.body, updated_by: req.user.id },
            { new: true }
        );
        if (!doc) return res.status(404).json({ message: 'Not found' });
        res.json({ message: 'Academic year updated', academicYear: doc });
    } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.deleteAcademicYear = async (req, res) => {
    try {
        await AcademicYear.deleteOne({ _id: req.params.id, tenant_id: req.user.tenant_id });
        res.json({ message: 'Academic year deleted' });
    } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.lockAcademicYear = async (req, res) => {
    try {
        const { id } = req.params;
        const tenant_id = req.user.tenant_id;
        const year = await AcademicYear.findOne({ _id: id, tenant_id, is_active: true });
        if (!year) return res.status(404).json({ message: 'Academic year not found' });
        const newLockState = !year.is_portal_locked;
        await AcademicYear.updateMany({ tenant_id }, { is_portal_locked: false });
        if (newLockState) {
            await AcademicYear.findByIdAndUpdate(id, { is_portal_locked: true, updated_by: req.user.id });
        }
        res.json({ message: newLockState ? 'Academic year locked for portal' : 'Academic year unlocked', is_portal_locked: newLockState });
    } catch (err) { res.status(500).json({ message: err.message }); }
};
