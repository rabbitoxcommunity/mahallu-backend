const DeathRegistry = require('../models/DeathRegistry');
const mongoose = require('mongoose');

const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

exports.getReports = async (req, res) => {
    try {
        const tenant_id = new mongoose.Types.ObjectId(req.user.tenant_id);
        const { from_date, to_date, gender } = req.query;

        const query = { tenant_id, is_active: true };

        if (from_date || to_date) {
            query.date_of_death = {};
            if (from_date) query.date_of_death.$gte = new Date(from_date);
            if (to_date) {
                const to = new Date(to_date);
                to.setHours(23, 59, 59, 999);
                query.date_of_death.$lte = to;
            }
        }

        if (gender) query.gender = gender;

        const twelveMonthsAgo = new Date();
        twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 11);
        twelveMonthsAgo.setDate(1);
        twelveMonthsAgo.setHours(0, 0, 0, 0);

        const [
            records,
            by_gender_agg,
            monthly_agg,
            certificates_generated,
        ] = await Promise.all([
            DeathRegistry.find(query)
                .sort({ date_of_death: -1 })
                .limit(200)
                .populate('house_id', 'house_code householder_name')
                .populate('member_id', 'full_name')
                .lean(),
            DeathRegistry.aggregate([
                { $match: query },
                { $group: { _id: '$gender', count: { $sum: 1 } } },
                { $sort: { count: -1 } },
            ]),
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
            DeathRegistry.countDocuments({ ...query, certificate_generated: true }),
        ]);

        const total = records.length;
        const male = records.filter((r) => r.gender === 'Male').length;
        const female = records.filter((r) => r.gender === 'Female').length;
        const other = records.filter((r) => r.gender === 'Other').length;

        // Age group bucketing
        const ageGroups = {
            'Under 18': 0,
            '18-40': 0,
            '41-60': 0,
            '61-80': 0,
            'Above 80': 0,
        };

        for (const r of records) {
            if (r.age !== null && r.age !== undefined) {
                if (r.age < 18) ageGroups['Under 18']++;
                else if (r.age <= 40) ageGroups['18-40']++;
                else if (r.age <= 60) ageGroups['41-60']++;
                else if (r.age <= 80) ageGroups['61-80']++;
                else ageGroups['Above 80']++;
            }
        }

        const by_age_group = Object.entries(ageGroups).map(([name, count]) => ({ name, count }));

        const monthly = monthly_agg.map((item) => ({
            name: `${monthNames[item._id.month - 1]} ${item._id.year}`,
            count: item.count,
        }));

        return res.json({
            summary: {
                total,
                male,
                female,
                other,
                certificates_generated,
            },
            by_gender: by_gender_agg,
            by_age_group,
            monthly,
            records,
        });
    } catch (err) {
        console.error('getReports error:', err);
        return res.status(500).json({ message: 'Server error', error: err.message });
    }
};
