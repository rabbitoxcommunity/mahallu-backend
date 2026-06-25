const WelfareDistribution = require('../models/WelfareDistribution');
const WelfareProgram = require('../models/WelfareProgram');
const House = require('../models/House');
const mongoose = require('mongoose');

// GET /api/community/welfare/dashboard
exports.getDashboard = async (req, res) => {
  try {
    const tenant_id = req.user.tenant_id;
    const tenantObjId = new mongoose.Types.ObjectId(tenant_id);
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    const [
      activePrograms,
      beneficiaryFamilies,
      zakatEligibleFamilies,
      assistedThisMonth,
      totalAmountAgg,
      monthlyDistribution,
      distributionByProgram,
      distributionBySource
    ] = await Promise.all([
      WelfareProgram.countDocuments({ tenant_id, status: 'active', is_active: true }),

      WelfareDistribution.distinct('family_id', { tenant_id, is_active: true }),

      House.countDocuments({ tenant_id, zakat_eligible: true, is_active: true }),

      WelfareDistribution.distinct('family_id', {
        tenant_id,
        is_active: true,
        distribution_date: { $gte: startOfMonth, $lte: endOfMonth }
      }),

      WelfareDistribution.aggregate([
        { $match: { tenant_id: tenantObjId, is_active: true } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),

      WelfareDistribution.aggregate([
        {
          $match: {
            tenant_id: tenantObjId,
            is_active: true,
            distribution_date: {
              $gte: new Date(now.getFullYear(), now.getMonth() - 11, 1)
            }
          }
        },
        {
          $group: {
            _id: {
              year: { $year: '$distribution_date' },
              month: { $month: '$distribution_date' }
            },
            total: { $sum: '$amount' },
            count: { $sum: 1 }
          }
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } }
      ]),

      WelfareDistribution.aggregate([
        { $match: { tenant_id: tenantObjId, is_active: true } },
        { $group: { _id: '$program_id', total: { $sum: '$amount' }, count: { $sum: 1 } } },
        {
          $lookup: {
            from: 'welfareprograms',
            localField: '_id',
            foreignField: '_id',
            as: 'program'
          }
        },
        { $unwind: { path: '$program', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            program_name: { $ifNull: ['$program.program_name', 'Unknown'] },
            total: 1,
            count: 1
          }
        },
        { $sort: { total: -1 } },
        { $limit: 10 }
      ]),

      WelfareDistribution.aggregate([
        { $match: { tenant_id: tenantObjId, is_active: true } },
        { $group: { _id: '$funding_source', total: { $sum: '$amount' }, count: { $sum: 1 } } },
        { $sort: { total: -1 } }
      ])
    ]);

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const formattedMonthly = monthlyDistribution.map(m => ({
      name: `${monthNames[m._id.month - 1]} ${m._id.year}`,
      total: m.total,
      count: m.count
    }));

    res.json({
      summary: {
        total_beneficiary_families: beneficiaryFamilies.length,
        zakat_eligible_families: zakatEligibleFamilies,
        families_assisted_this_month: assistedThisMonth.length,
        total_distribution_amount: totalAmountAgg[0]?.total || 0,
        active_welfare_programs: activePrograms
      },
      charts: {
        monthly_distribution: formattedMonthly,
        by_program: distributionByProgram,
        by_source: distributionBySource
      }
    });
  } catch (err) {
    console.error('getDashboard error:', err);
    res.status(500).json({ message: err.message });
  }
};
