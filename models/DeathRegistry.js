const mongoose = require('mongoose');

const DeathRegistrySchema = new mongoose.Schema(
    {
        tenant_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Tenant',
            required: true,
        },
        death_id: {
            type: String,
            required: true,
        },
        certificate_no: {
            type: String,
        },
        is_registered_member: {
            type: Boolean,
            default: false,
        },
        member_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Member',
            default: null,
        },
        house_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'House',
            default: null,
        },
        name: {
            type: String,
            required: true,
            trim: true,
        },
        gender: {
            type: String,
            enum: ['Male', 'Female', 'Other'],
        },
        dob: {
            type: Date,
        },
        age: {
            type: Number,
        },
        father_name: {
            type: String,
            trim: true,
        },
        mother_name: {
            type: String,
            trim: true,
        },
        spouse_name: {
            type: String,
            trim: true,
        },
        primary_contact: {
            type: String,
            trim: true,
        },
        date_of_death: {
            type: Date,
            required: true,
            index: true,
        },
        time_of_death: {
            type: String,
        },
        place_of_death: {
            type: String,
            trim: true,
        },
        cause_of_death: {
            type: String,
            trim: true,
        },
        hospital: {
            type: String,
            trim: true,
        },
        janaza_date: {
            type: Date,
        },
        janaza_time: {
            type: String,
        },
        charge_applicable: {
            type: Boolean,
            default: false,
        },
        charge_amount: {
            type: Number,
            default: 0,
        },
        payment_status: {
            type: String,
            enum: ['paid', 'partial', 'pending'],
            default: 'pending',
        },
        payment_method: {
            type: String,
            enum: ['cash', 'upi', 'bank'],
        },
        income_transaction_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'DirectIncome',
            default: null,
        },
        certificate_generated: {
            type: Boolean,
            default: false,
        },
        notes: {
            type: String,
            trim: true,
        },
        created_by: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        is_active: {
            type: Boolean,
            default: true,
        },
    },
    {
        timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    }
);

DeathRegistrySchema.index({ tenant_id: 1, death_id: 1 }, { unique: true });
DeathRegistrySchema.index({ tenant_id: 1, date_of_death: 1 });

module.exports = mongoose.model('DeathRegistry', DeathRegistrySchema);
