const mongoose = require("mongoose");

const MemberSchema = new mongoose.Schema({
    tenant_id: mongoose.Schema.Types.ObjectId,
    family_id: mongoose.Schema.Types.ObjectId,
    full_name: String,
    dob: Date,
    gender: String,
    relation_to_head: String,
    whatsapp: String,
    email: String,
    yateem_status: Boolean,
    marital_status: String,
    occupation: String
}, { timestamps: true });

module.exports = mongoose.model("Member", MemberSchema);