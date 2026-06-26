const mongoose = require('mongoose');

const AnnouncementSchema = new mongoose.Schema(
    {
        tenant_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Tenant',
            required: true,
        },
        announcement_no: {
            type: String,
            required: true,
        },
        type: {
            type: String,
            required: true,
            trim: true,
        },
        title: {
            type: String,
            required: true,
            trim: true,
        },
        body: {
            type: String,
            required: true,
            trim: true,
        },
        status: {
            type: String,
            enum: ['draft', 'published', 'archived'],
            default: 'draft',
        },
        visibility: {
            type: String,
            enum: ['public', 'members_only', 'committee_only'],
            default: 'members_only',
        },
        publish_immediately: {
            type: Boolean,
            default: false,
        },
        scheduled_at: {
            type: Date,
            default: null,
        },
        published_at: {
            type: Date,
            default: null,
        },
        announcement_date: {
            type: Date,
            default: null,
        },
        is_archived: {
            type: Boolean,
            default: false,
        },
        // source tracking
        source: {
            type: String,
            enum: ['standalone', 'module'],
            default: 'standalone',
        },
        source_module: {
            type: String,
            default: null,
        },
        source_record_id: {
            type: mongoose.Schema.Types.ObjectId,
            default: null,
        },
        template_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'AnnouncementTemplate',
            default: null,
        },
        field_values: {
            type: mongoose.Schema.Types.Mixed,
            default: null,
        },
        created_by: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        attachments: {
            type: [String],
            default: [],
        },
    },
    {
        timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    }
);

AnnouncementSchema.index({ tenant_id: 1, announcement_no: 1 }, { unique: true });
AnnouncementSchema.index({ tenant_id: 1, status: 1 });
AnnouncementSchema.index({ tenant_id: 1, created_at: -1 });

module.exports = mongoose.model('Announcement', AnnouncementSchema);
