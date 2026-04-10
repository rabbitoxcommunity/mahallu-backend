const mongoose = require("mongoose");

const FamilySchema = new mongoose.Schema({
    tenant_id: {
        type: mongoose.Schema.Types.ObjectId,
        required: true
    },

    house_name: {
        type: String,
        required: true
    },

    address: String,

    primary_contact: {
        type: String,
        required: true
    },

    economic_status: {
        type: String,
        enum: ["Normal", "Miskeen", "Poor"],
        default: "Normal"
    },

    zakat_eligible: {
        type: Boolean,
        default: false
    },
    notes: String,
    is_active: {
        type: Boolean,
        default: true
    }

}, { timestamps: true });

module.exports = mongoose.model("Family", FamilySchema);