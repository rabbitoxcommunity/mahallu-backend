const Result = require('../models/Result');
const MadrasaSubject = require('../models/MadrasaSubject');
const Member = require('../models/Member');

const getGrade = (pct) => {
    if (pct >= 90) return 'A+';
    if (pct >= 80) return 'A';
    if (pct >= 70) return 'B+';
    if (pct >= 60) return 'B';
    if (pct >= 50) return 'C';
    return 'F';
};

const genResultNo = async (tenant_id) => {
    const docs = await Result.find({ tenant_id, result_no: { $regex: '^RES-' } }).select('result_no');
    const nums = docs.map(d => parseInt((d.result_no || '').replace('RES-', ''), 10)).filter(n => !isNaN(n));
    const num = nums.length ? Math.max(...nums) : 0;
    return `RES-${String(num + 1).padStart(5, '0')}`;
};

const calcSummary = (subjects) => {
    const total_max = subjects.reduce((s, sub) => s + (Number(sub.max_marks) || 0), 0);
    const total_obtained = subjects.reduce((s, sub) => s + (Number(sub.obtained_marks) || 0), 0);
    const percentage = total_max > 0 ? Math.round((total_obtained / total_max) * 100 * 100) / 100 : 0;
    return { total_max_marks: total_max, total_obtained_marks: total_obtained, percentage, overall_grade: getGrade(percentage), is_pass: percentage >= 50 };
};

exports.createResult = async (req, res) => {
    try {
        const { member_id, student_name, madrasa_id, class_id, result_type_id, academic_year_id, subjects = [], teacher_remarks, principal_remarks, status, public_visibility } = req.body;
        if (!student_name && !member_id) return res.status(400).json({ message: 'Student name is required' });
        if (!madrasa_id) return res.status(400).json({ message: 'Madrasa is required' });
        if (!class_id) return res.status(400).json({ message: 'Class is required' });
        if (!result_type_id) return res.status(400).json({ message: 'Result type is required' });
        if (!academic_year_id) return res.status(400).json({ message: 'Academic year is required' });
        if (!subjects.length) return res.status(400).json({ message: 'At least one subject is required' });

        const result_no = await genResultNo(req.user.tenant_id);
        const summary = calcSummary(subjects);
        const is_published = status === 'published';

        const result = await Result.create({
            tenant_id: req.user.tenant_id,
            result_no, member_id: member_id || undefined, student_name, madrasa_id, class_id, result_type_id, academic_year_id, subjects,
            ...summary, teacher_remarks, principal_remarks,
            status: status || 'draft', is_published, public_visibility: public_visibility || false,
            created_by: req.user.id,
        });
        res.status(201).json({ message: 'Result created', result });
    } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.getResults = async (req, res) => {
    try {
        const { page = 1, limit = 20, search, madrasa_id, class_id, result_type_id, academic_year_id, status } = req.query;
        const tenant_id = req.user.tenant_id;
        const skip = (page - 1) * limit;

        const query = { tenant_id, is_active: true };
        if (search) {
            const members = await Member.find({
                tenant_id,
                $or: [{ full_name: { $regex: search, $options: 'i' } }, { whatsapp: { $regex: search, $options: 'i' } }],
            }).select('_id');
            const memberIds = members.map(m => m._id);
            query.$or = [
                { result_no: { $regex: search, $options: 'i' } },
                { student_name: { $regex: search, $options: 'i' } },
                ...(memberIds.length ? [{ member_id: { $in: memberIds } }] : []),
            ];
        }
        if (madrasa_id) query.madrasa_id = madrasa_id;
        if (class_id) query.class_id = class_id;
        if (result_type_id) query.result_type_id = result_type_id;
        if (academic_year_id) query.academic_year_id = academic_year_id;
        if (status) query.status = status;

        const [results, total] = await Promise.all([
            Result.find(query)
                .populate('member_id', 'full_name whatsapp')
                .populate('madrasa_id', 'name code')
                .populate('class_id', 'name code')
                .populate('result_type_id', 'name code')
                .populate('academic_year_id', 'name code')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(Number(limit)),
            Result.countDocuments(query),
        ]);
        res.json({ results, total, page: Number(page), pages: Math.ceil(total / limit) });
    } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.getResult = async (req, res) => {
    try {
        const result = await Result.findOne({ _id: req.params.id, tenant_id: req.user.tenant_id })
            .populate('member_id', 'full_name whatsapp contact_number gender dob house_id')
            .populate({ path: 'member_id', populate: { path: 'house_id', select: 'house_code householder_name' } })
            .populate('madrasa_id', 'name code type')
            .populate('class_id', 'name code')
            .populate('result_type_id', 'name code')
            .populate('academic_year_id', 'name code')
            .populate('subjects.subject_id', 'name code short_name');
        if (!result) return res.status(404).json({ message: 'Result not found' });
        res.json({ result });
    } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.updateResult = async (req, res) => {
    try {
        const { subjects = [], status, public_visibility, ...rest } = req.body;
        const summary = subjects.length ? calcSummary(subjects) : {};
        const is_published = status === 'published';
        const doc = await Result.findOneAndUpdate(
            { _id: req.params.id, tenant_id: req.user.tenant_id },
            { ...rest, subjects, ...summary, status, is_published, public_visibility, updated_by: req.user.id },
            { new: true }
        );
        if (!doc) return res.status(404).json({ message: 'Not found' });
        res.json({ message: 'Result updated', result: doc });
    } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.publishResult = async (req, res) => {
    try {
        const doc = await Result.findOneAndUpdate(
            { _id: req.params.id, tenant_id: req.user.tenant_id },
            { status: 'published', is_published: true, updated_by: req.user.id },
            { new: true }
        );
        if (!doc) return res.status(404).json({ message: 'Not found' });
        res.json({ message: 'Result published', result: doc });
    } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.deleteResult = async (req, res) => {
    try {
        await Result.findOneAndUpdate({ _id: req.params.id, tenant_id: req.user.tenant_id }, { is_active: false });
        res.json({ message: 'Result deleted' });
    } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.searchMembers = async (req, res) => {
    try {
        const { search = '' } = req.query;
        const members = await Member.find({
            tenant_id: req.user.tenant_id,
            is_active: true,
            $or: [
                { full_name: { $regex: search, $options: 'i' } },
                { whatsapp: { $regex: search, $options: 'i' } },
                { contact_number: { $regex: search, $options: 'i' } },
            ],
        }).select('_id full_name whatsapp gender').limit(20);
        res.json({ members });
    } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.getSubjectsByClass = async (req, res) => {
    try {
        const { class_id } = req.query;
        if (!class_id) return res.status(400).json({ message: 'class_id required' });
        const subjects = await MadrasaSubject.find({
            tenant_id: req.user.tenant_id,
            class_id,
            is_active: true,
            status: 'active',
        }).select('_id name short_name code').sort({ name: 1 });
        res.json({ subjects });
    } catch (err) { res.status(500).json({ message: err.message }); }
};
