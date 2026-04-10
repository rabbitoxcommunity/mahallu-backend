const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
    name: String,
    email: { type: String, unique: true },
    password: String,
    role: String,
    tenant_id: mongoose.Schema.Types.ObjectId
}, { timestamps: true });

module.exports = mongoose.model("User", UserSchema);