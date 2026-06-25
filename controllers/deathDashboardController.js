const DeathRegistry = require('../models/DeathRegistry');
const mongoose = require('mongoose');

exports.getDashboard = async (req, res) => {
    try {
        const tenant_id = new mongoose.Types.ObjectId(req.user.tenant_id);

        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const startOfYear = new Date(now.getFullYear(), 0, 1);

        const twelveMonthsAgo = new Date();
        twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 11);
        twelveMonthsAgo.setDate(1);
        twelveMonthsAgo.setHours(0, 0, 0, 0);

        const [
            total_records,
            this_month,
            this_year,
            certificates_generated,
            monthly_agg,
        ] = await Promise.all([
            DeathRegistry.countDocuments({ tenant_id, is_active: true }),
            DeathRegistry.countDocuments({
                tenant_id,
                is_active: true,
                date_of_death: { $gte: startOfMonth },
            }),
            DeathRegistry.countDocuments({
                tenant_id,
                is_active: true,
                date_of_death: { $gte: startOfYear },
            }),
            DeathRegistry.countDocuments({
                tenant_id,
                is_active: true,
                certificate_generated: true,
            }),
            DeathRegistry.aggregate([
                {
                    $match: {
                        tenant_id,
                        is_active: true,
                        date_of_death: { $gte: twelveMonthsAgo },
                    },
                },
                {
                    $group: {
                        _id: {
                            year: { $year: '$date_of_death' },
                            month: { $month: '$date_of_death' },
                        },
                        count: { $sum: 1 },
                    },
                },
                { $sort: { '_id.year': 1, '_id.month': 1 } },
            ]),
        ]);

        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

        const monthly_stats = monthly_agg.map((item) => ({
            name: `${monthNames[item._id.month - 1]} ${item._id.year}`,
            count: item.count,
        }));

        return res.json({
            summary: {
                total_records,
                this_month,
                this_year,
                certificates_generated,
            },
            monthly_stats,
        });
    } catch (err) {
        console.error('getDashboard error:', err);
        return res.status(500).json({ message: 'Server error', error: err.message });
    }
};
