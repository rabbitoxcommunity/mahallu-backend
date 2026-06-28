const mongoose = require('mongoose');

const SubjectResultSchema = new mongoose.Schema({
    subject_id: { type: mongoose.Schema.Types.ObjectId, ref: 'MadrasaSubject' },
    subject_name: { type: String, trim: true },
    max_marks: { type: Number, default: 100 },
    obtained_marks: { type: Number, default: 0 },
    grade: { type: String, trim: true },
    remarks: { type: String, trim: true },
}, { _id: true });

const ResultSchema = new mongoose.Schema({
    tenant_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    result_no: { type: String, trim: true },
    member_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Member' },
    student_name: { type: String, trim: true },
    madrasa_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Madrasa', required: true },
    class_id: { type: mongoose.Schema.Types.ObjectId, ref: 'MadrasaClass', required: true },
    result_type_id: { type: mongoose.Schema.Types.ObjectId, ref: 'ResultType', required: true },
    academic_year_id: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear' },
    subjects: [SubjectResultSchema],
    total_max_marks: { type: Number, default: 0 },
    total_obtained_marks: { type: Number, default: 0 },
    percentage: { type: Number, default: 0 },
    overall_grade: { type: String, trim: true },
    is_pass: { type: Boolean, default: false },
    teacher_remarks: { type: String, trim: true },
    principal_remarks: { type: String, trim: true },
    status: { type: String, enum: ['draft', 'published'], default: 'draft' },
    is_published: { type: Boolean, default: false },
    public_visibility: { type: Boolean, default: false },
    is_active: { type: Boolean, default: true },
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updated_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

ResultSchema.index({ tenant_id: 1, result_no: 1 });
ResultSchema.index({ tenant_id: 1, member_id: 1, madrasa_id: 1, class_id: 1, result_type_id: 1, academic_year_id: 1 });

module.exports = mongoose.model('Result', ResultSchema);
