const mongoose = require("mongoose");

const CounterSchema = new mongoose.Schema(
    {
        tenant_id: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            index: true,
        },

        type: {
            type: String,
            required: true,
        },

        seq: {
            type: Number,
            default: 0,
        },
    },
    { timestamps: true }
);

CounterSchema.index(
    { tenant_id: 1, type: 1 },
    { unique: true }
);

module.exports = mongoose.model("Counter", CounterSchema);