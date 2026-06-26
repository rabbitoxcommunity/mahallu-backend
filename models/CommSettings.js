const mongoose = require('mongoose');

const CommSettingsSchema = new mongoose.Schema(
    {
        tenant_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Tenant',
            required: true,
            unique: true,
        },
        organization_name: {
            type: String,
            trim: true,
            default: '',
        },
        signature: {
            type: String,
            trim: true,
            default: '',
        },
        announcement_types: {
            type: [{ id: String, name: String }],
            default: [
                { id: 'death_notice', name: 'Death Notice' },
                { id: 'marriage_notice', name: 'Marriage Notice' },
                { id: 'welfare', name: 'Welfare' },
                { id: 'meeting', name: 'Meeting' },
                { id: 'general', name: 'General' },
                { id: 'ramadan', name: 'Ramadan' },
                { id: 'eid', name: 'Eid' },
                { id: 'emergency', name: 'Emergency' },
                { id: 'other', name: 'Other' },
            ],
        },
    },
    {
        timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    }
);

module.exports = mongoose.model('CommSettings', CommSettingsSchema);
