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
            type: [{ name: { type: String, trim: true } }],
            default: [
                { name: 'Death Notice' },
                { name: 'Marriage Notice' },
                { name: 'Welfare' },
                { name: 'Meeting' },
                { name: 'General' },
                { name: 'Ramadan' },
                { name: 'Eid' },
                { name: 'Emergency' },
                { name: 'Other' },
            ],
        },
    },
    {
        timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    }
);

module.exports = mongoose.model('CommSettings', CommSettingsSchema);
