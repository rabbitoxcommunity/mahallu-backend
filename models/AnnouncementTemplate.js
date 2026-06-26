const mongoose = require('mongoose');

const DynamicFieldSchema = new mongoose.Schema(
    {
        label: { type: String, required: true, trim: true },
        key: { type: String, required: true, trim: true },
        input_type: {
            type: String,
            enum: ['text', 'textarea', 'number', 'date', 'time', 'datetime', 'select', 'phone', 'email'],
            default: 'text',
        },
        required: { type: Boolean, default: false },
        placeholder: { type: String, trim: true, default: '' },
        default_value: { type: String, trim: true, default: '' },
        options: { type: [String], default: [] },
        order: { type: Number, default: 0 },
    },
    { _id: false }
);

const AnnouncementTemplateSchema = new mongoose.Schema(
    {
        tenant_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Tenant',
            required: true,
        },
        template_name: {
            type: String,
            required: true,
            trim: true,
        },
        // module drives which announcement type this template belongs to
        module: {
            type: String,
            trim: true,
            default: '',
        },
        // category kept for backward compatibility with old records
        category: {
            type: String,
            trim: true,
        },
        message: {
            type: String,
            required: true,
            trim: true,
        },
        dynamic_fields: {
            type: [DynamicFieldSchema],
            default: [],
        },
        // variables kept for backward compatibility
        variables: {
            type: [String],
            default: [],
        },
        is_active: {
            type: Boolean,
            default: true,
        },
        created_by: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
    },
    {
        timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    }
);

AnnouncementTemplateSchema.index({ tenant_id: 1, template_name: 1 });
AnnouncementTemplateSchema.index({ tenant_id: 1, module: 1 });
AnnouncementTemplateSchema.index({ tenant_id: 1, category: 1 });

module.exports = mongoose.model('AnnouncementTemplate', AnnouncementTemplateSchema);
