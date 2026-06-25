const WelfareDistribution = require('../models/WelfareDistribution');
const WelfareProgram = require('../models/WelfareProgram');
const House = require('../models/House');
const Family = require('../models/Family');
const Member = require('../models/Member');
const mongoose = require('mongoose');

const generateDistributionNo = async (tenant_id) => {
  const last = await WelfareDistribution.findOne({ tenant_id })
    .sort({ created_at: -1 })
    .select('distribution_no');
  const num = last ? parseInt(last.distribution_no.replace('WLF-', ''), 10) : 0;
  return `WLF-${String(num + 1).padStart(4, '0')}`;
};

const populateFamilyName = async (distObj) => {
  if (distObj.family_id?.family_id) {
    const family = await Family.findById(distObj.family_id.family_id).select('family_name family_code');
    distObj.family_id.family_name = family?.family_name || '';
    distObj.family_id.family_code = family?.family_code || '';
  }
  return distObj;
};

// POST /api/community/welfare/distributions
exports.createDistribution = async (req, res) => {
  try {
    const { is_external, family_id, beneficiary_name, beneficiary_contact, program_id, distribution_type, funding_source, amount, distribution_date, notes } = req.body;
    const tenant_id = req.user.tenant_id;

    if (!program_id) return res.status(400).json({ message: 'Program is required' });
    if (!distribution_type) return res.status(400).json({ message: 'Distribution type is required' });
    if (!funding_source) return res.status(400).json({ message: 'Funding source is required' });
    if (!amount || Number(amount) <= 0) return res.status(400).json({ message: 'Amount must be positive' });
    if (!distribution_date) return res.status(400).json({ message: 'Distribution date is required' });

    const docData = { tenant_id, program_id, distribution_type, funding_source, amount: Number(amount), distribution_date, notes, created_by: req.user.id };

    if (is_external) {
      if (!beneficiary_name) return res.status(400).json({ message: 'Beneficiary name is required' });
      docData.is_external = true;
      docData.beneficiary_name = beneficiary_name;
      docData.beneficiary_contact = beneficiary_contact || '';
    } else {
      if (!family_id) return res.status(400).json({ message: 'Family is required' });
      const house = await House.findOne({ _id: family_id, tenant_id });
      if (!house) return res.status(404).json({ message: 'Family/House not found' });
      docData.family_id = family_id;
    }

    const program = await WelfareProgram.findOne({ _id: program_id, tenant_id, is_active: true });
    if (!program) return res.status(404).json({ message: 'Program not found' });

    docData.distribution_no = await generateDistributionNo(tenant_id);

    const distribution = await WelfareDistribution.create(docData);

    const populated = await WelfareDistribution.findById(distribution._id)
      .populate('family_id', 'house_code householder_name primary_contact family_id economic_status zakat_eligible')
      .populate('program_id', 'program_name program_code')
      .populate('created_by', 'name');

    const populatedObj = await populateFamilyName(populated.toObject());

    res.status(201).json({ message: 'Distribution recorded successfully', distribution: populatedObj });
  } catch (err) {
    console.error('createDistribution error:', err);
    res.status(500).json({ message: err.message });
  }
};

// GET /api/community/welfare/distributions
exports.getDistributions = async (req, res) => {
  try {
    const { page = 1, limit = 20, search, program_id, distribution_type, funding_source, from_date, to_date } = req.query;
    const tenant_id = req.user.tenant_id;

    const query = { tenant_id, is_active: true };

    if (program_id) query.program_id = new mongoose.Types.ObjectId(program_id);
    if (distribution_type) query.distribution_type = distribution_type;
    if (funding_source) query.funding_source = funding_source;

    if (from_date || to_date) {
      query.distribution_date = {};
      if (from_date) {
        const d = new Date(from_date);
        d.setHours(0, 0, 0, 0);
        query.distribution_date.$gte = d;
      }
      if (to_date) {
        const d = new Date(to_date);
        d.setHours(23, 59, 59, 999);
        query.distribution_date.$lte = d;
      }
    }

    if (search) {
      const matchingHouses = await House.find({
        tenant_id,
        $or: [
          { house_code: { $regex: search, $options: 'i' } },
          { householder_name: { $regex: search, $options: 'i' } },
          { primary_contact: { $regex: search, $options: 'i' } }
        ]
      }).select('_id');
      query.family_id = { $in: matchingHouses.map(h => h._id) };
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [distributions, total, allDists] = await Promise.all([
      WelfareDistribution.find(query)
        .populate('family_id', 'house_code householder_name primary_contact family_id economic_status zakat_eligible')
        .populate('program_id', 'program_name program_code')
        .populate('created_by', 'name')
        .sort({ distribution_date: -1 })
        .skip(skip)
        .limit(Number(limit)),
      WelfareDistribution.countDocuments(query),
      WelfareDistribution.find(query).select('amount')
    ]);

    const totalAmount = allDists.reduce((sum, d) => sum + (d.amount || 0), 0);

    const populated = await Promise.all(distributions.map(async (dist) => {
      return populateFamilyName(dist.toObject());
    }));

    res.json({
      distributions: populated,
      total,
      page: Number(page),
      pages: Math.ceil(total / Number(limit)),
      total_amount: totalAmount
    });
  } catch (err) {
    console.error('getDistributions error:', err);
    res.status(500).json({ message: err.message });
  }
};

// PUT /api/community/welfare/distributions/:id
exports.updateDistribution = async (req, res) => {
  try {
    const { is_external, beneficiary_name, beneficiary_contact, program_id, distribution_type, funding_source, amount, distribution_date, notes } = req.body;
    const tenant_id = req.user.tenant_id;

    const updateData = { program_id, distribution_type, funding_source, amount: Number(amount), distribution_date, notes };

    if (is_external) {
      updateData.is_external = true;
      updateData.beneficiary_name = beneficiary_name;
      updateData.beneficiary_contact = beneficiary_contact || '';
      updateData.family_id = null;
    } else {
      updateData.is_external = false;
      updateData.beneficiary_name = '';
      updateData.beneficiary_contact = '';
    }

    const distribution = await WelfareDistribution.findOneAndUpdate(
      { _id: req.params.id, tenant_id },
      updateData,
      { new: true, runValidators: true }
    )
      .populate('family_id', 'house_code householder_name primary_contact family_id economic_status')
      .populate('program_id', 'program_name program_code')
      .populate('created_by', 'name');

    if (!distribution) return res.status(404).json({ message: 'Distribution not found' });

    const populatedObj = await populateFamilyName(distribution.toObject());
    res.json({ message: 'Distribution updated successfully', distribution: populatedObj });
  } catch (err) {
    console.error('updateDistribution error:', err);
    res.status(500).json({ message: err.message });
  }
};

// DELETE /api/community/welfare/distributions/:id
exports.deleteDistribution = async (req, res) => {
  try {
    const tenant_id = req.user.tenant_id;
    const distribution = await WelfareDistribution.findOneAndUpdate(
      { _id: req.params.id, tenant_id },
      { is_active: false },
      { new: true }
    );
    if (!distribution) return res.status(404).json({ message: 'Distribution not found' });
    res.json({ message: 'Distribution deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/community/welfare/beneficiaries
exports.getBeneficiaries = async (req, res) => {
  try {
    const { page = 1, limit = 20, search, economic_status, zakat_eligible, program_id } = req.query;
    const tenant_id = req.user.tenant_id;

    const houseQuery = { tenant_id, is_active: true };
    if (search) {
      houseQuery.$or = [
        { house_code: { $regex: search, $options: 'i' } },
        { householder_name: { $regex: search, $options: 'i' } },
        { primary_contact: { $regex: search, $options: 'i' } }
      ];
    }
    if (economic_status) houseQuery.economic_status = economic_status;
    if (zakat_eligible !== undefined && zakat_eligible !== '') {
      houseQuery.zakat_eligible = zakat_eligible === 'true';
    }

    let houseIds;
    if (program_id) {
      const dists = await WelfareDistribution.distinct('family_id', {
        tenant_id,
        program_id: new mongoose.Types.ObjectId(program_id),
        is_active: true
      });
      houseQuery._id = { $in: dists };
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [houses, total] = await Promise.all([
      House.find(houseQuery)
        .populate('family_id', 'family_name family_code')
        .sort({ house_code: 1 })
        .skip(skip)
        .limit(Number(limit)),
      House.countDocuments(houseQuery)
    ]);

    houseIds = houses.map(h => h._id);

    const [welfareStats, memberCounts] = await Promise.all([WelfareDistribution.aggregate([
      {
        $match: {
          tenant_id: new mongoose.Types.ObjectId(tenant_id),
          family_id: { $in: houseIds },
          is_active: true
        }
      },
      {
        $group: {
          _id: '$family_id',
          total_amount: { $sum: '$amount' },
          last_assistance: { $max: '$distribution_date' },
          distribution_count: { $sum: 1 }
        }
      }
    ]),
    Member.aggregate([
      { $match: { house_id: { $in: houseIds }, is_active: true } },
      { $group: { _id: '$house_id', count: { $sum: 1 } } }
    ])
    ]);

    const statsMap = {};
    welfareStats.forEach(s => { statsMap[s._id.toString()] = s; });

    const memberCountMap = {};
    memberCounts.forEach(m => { memberCountMap[m._id.toString()] = m.count; });

    const beneficiaries = houses.map(house => {
      const houseObj = house.toObject();
      const stats = statsMap[house._id.toString()] || {};
      return {
        ...houseObj,
        total_assistance: stats.total_amount || 0,
        last_assistance: stats.last_assistance || null,
        distribution_count: stats.distribution_count || 0,
        member_count: memberCountMap[house._id.toString()] || 0
      };
    });

    res.json({ beneficiaries, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    console.error('getBeneficiaries error:', err);
    res.status(500).json({ message: err.message });
  }
};

// GET /api/community/welfare/family/:id
exports.getFamilyWelfareHistory = async (req, res) => {
  try {
    const { id } = req.params;
    const tenant_id = req.user.tenant_id;

    const house = await House.findOne({ _id: id, tenant_id })
      .populate('family_id', 'family_name family_code');

    if (!house) return res.status(404).json({ message: 'House not found' });

    const members = await Member.find({ house_id: id, is_active: true });

    const distributions = await WelfareDistribution.find({
      tenant_id,
      family_id: id,
      is_active: true
    })
      .populate('program_id', 'program_name program_code')
      .populate('created_by', 'name')
      .sort({ distribution_date: -1 });

    const totalAssistance = distributions.reduce((sum, d) => sum + (d.amount || 0), 0);

    res.json({
      house,
      members,
      distributions,
      summary: {
        total_distributions: distributions.length,
        total_amount: totalAssistance,
        last_assistance: distributions[0]?.distribution_date || null
      }
    });
  } catch (err) {
    console.error('getFamilyWelfareHistory error:', err);
    res.status(500).json({ message: err.message });
  }
};
