const WelfareDistribution = require('../models/WelfareDistribution');
const Family = require('../models/Family');
const House = require('../models/House');
const mongoose = require('mongoose');

// GET /api/community/welfare/reports
exports.getReports = async (req, res) => {
  try {
    const { from_date, to_date, program_id, funding_source, distribution_type } = req.query;
    const tenant_id = req.user.tenant_id;
    const tenantObjId = new mongoose.Types.ObjectId(tenant_id);

    const matchQuery = { tenant_id: tenantObjId, is_active: true };

    if (from_date || to_date) {
      matchQuery.distribution_date = {};
      if (from_date) {
        const d = new Date(from_date);
        d.setHours(0, 0, 0, 0);
        matchQuery.distribution_date.$gte = d;
      }
      if (to_date) {
        const d = new Date(to_date);
        d.setHours(23, 59, 59, 999);
        matchQuery.distribution_date.$lte = d;
      }
    }

    if (program_id) matchQuery.program_id = new mongoose.Types.ObjectId(program_id);
    if (funding_source) matchQuery.funding_source = funding_source;
    if (distribution_type) matchQuery.distribution_type = distribution_type;

    const [summaryAgg, byProgram, bySource, byType, monthly, distributions] = await Promise.all([
      WelfareDistribution.aggregate([
        { $match: matchQuery },
        {
          $group: {
            _id: null,
            total_amount: { $sum: '$amount' },
            total_count: { $sum: 1 },
            unique_families: { $addToSet: '$family_id' }
          }
        }
      ]),

      WelfareDistribution.aggregate([
        { $match: matchQuery },
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
            program_code: { $ifNull: ['$program.program_code', '-'] },
            total: 1,
            count: 1
          }
        },
        { $sort: { total: -1 } }
      ]),

      WelfareDistribution.aggregate([
        { $match: matchQuery },
        { $group: { _id: '$funding_source', total: { $sum: '$amount' }, count: { $sum: 1 } } },
        { $sort: { total: -1 } }
      ]),

      WelfareDistribution.aggregate([
        { $match: matchQuery },
        { $group: { _id: '$distribution_type', total: { $sum: '$amount' }, count: { $sum: 1 } } },
        { $sort: { total: -1 } }
      ]),

      WelfareDistribution.aggregate([
        { $match: matchQuery },
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

      WelfareDistribution.find({ ...matchQuery, tenant_id })
        .populate('family_id', 'house_code householder_name primary_contact family_id economic_status')
        .populate('program_id', 'program_name program_code')
        .populate('created_by', 'name')
        .sort({ distribution_date: -1 })
        .limit(500)
    ]);

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const formattedMonthly = monthly.map(m => ({
      name: `${monthNames[m._id.month - 1]} ${m._id.year}`,
      total: m.total,
      count: m.count
    }));

    const distributionsWithFamily = await Promise.all(distributions.map(async (dist) => {
      const distObj = dist.toObject();
      if (distObj.family_id?.family_id) {
        const family = await Family.findById(distObj.family_id.family_id).select('family_name');
        distObj.family_id.family_name = family?.family_name || '';
      }
      return distObj;
    }));

    res.json({
      summary: {
        total_amount: summaryAgg[0]?.total_amount || 0,
        total_distributions: summaryAgg[0]?.total_count || 0,
        unique_families: (summaryAgg[0]?.unique_families || []).length
      },
      by_program: byProgram,
      by_source: bySource,
      by_type: byType,
      monthly: formattedMonthly,
      distributions: distributionsWithFamily
    });
  } catch (err) {
    console.error('getReports error:', err);
    res.status(500).json({ message: err.message });
  }
};
