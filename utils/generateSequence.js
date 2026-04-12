const Counter = require("../models/Counter");

const generateSequence = async ({
    tenantId,
    type,
    prefix = "FAM",
    pad = 4,
}) => {
    const counter = await Counter.findOneAndUpdate(
        {
            tenant_id: tenantId,
            type,
        },
        {
            $inc: { seq: 1 },
        },
        {
            new: true,
            upsert: true,
        }
    );

    return `${prefix}-${String(counter.seq).padStart(pad, "0")}`;
};

module.exports = generateSequence;