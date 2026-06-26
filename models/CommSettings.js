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
            type: [String],
            default: [
                'Death Notice',
                'Marriage Notice',
                'Welfare',
                'Meeting',
                'General',
                'Ramadan',
                'Eid',
                'Emergency',
                'Other',
            ],
        },
    },
    {
        timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    }
);

module.exports = mongoose.model('CommSettings', CommSettingsSchema);
