const WelfareProgram = require('../models/WelfareProgram');
const WelfareDistribution = require('../models/WelfareDistribution');
const mongoose = require('mongoose');

const generateProgramCode = async (tenant_id) => {
  const last = await WelfareProgram.findOne({ tenant_id })
    .sort({ created_at: -1 })
    .select('program_code');
  const num = last ? parseInt(last.program_code.replace('WPG-', ''), 10) : 0;
  return `WPG-${String(num + 1).padStart(3, '0')}`;
};

// POST /api/community/welfare/programs
exports.createProgram = async (req, res) => {
  try {
    const { program_name, description, budget, funding_source, start_date, end_date, status } = req.body;
    const tenant_id = req.user.tenant_id;

    if (!program_name) return res.status(400).json({ message: 'Program name is required' });
    if (!funding_source) return res.status(400).json({ message: 'Funding source is required' });

    const program_code = await generateProgramCode(tenant_id);

    const program = await WelfareProgram.create({
      tenant_id,
      program_code,
      program_name,
      description,
      budget: budget ? Number(budget) : 0,
      funding_source,
      start_date: start_date || null,
      end_date: end_date || null,
      status: status || 'active',
      created_by: req.user.id
    });

    res.status(201).json({ message: 'Program created successfully', program });
  } catch (err) {
    console.error('createProgram error:', err);
    res.status(500).json({ message: err.message });
  }
};

// GET /api/community/welfare/programs
exports.getPrograms = async (req, res) => {
  try {
    const { page = 1, limit = 20, search, status } = req.query;
    const tenant_id = req.user.tenant_id;

    const query = { tenant_id, is_active: true };
    if (search) {
      query.$or = [
        { program_name: { $regex: search, $options: 'i' } },
        { program_code: { $regex: search, $options: 'i' } }
      ];
    }
    if (status) query.status = status;

    const skip = (Number(page) - 1) * Number(limit);

    const [programs, total] = await Promise.all([
      WelfareProgram.find(query)
        .populate('created_by', 'name')
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(Number(limit)),
      WelfareProgram.countDocuments(query)
    ]);

    const programsWithStats = await Promise.all(programs.map(async (program) => {
      const stats = await WelfareDistribution.aggregate([
        {
          $match: {
            tenant_id: new mongoose.Types.ObjectId(tenant_id),
            program_id: program._id,
            is_active: true
          }
        },
        {
          $group: {
            _id: null,
            total_distributed: { $sum: '$amount' },
            count: { $sum: 1 }
          }
        }
      ]);

      const programObj = program.toObject();
      programObj.total_distributed = stats[0]?.total_distributed || 0;
      programObj.distribution_count = stats[0]?.count || 0;
      programObj.balance = (programObj.budget || 0) - (programObj.total_distributed || 0);
      return programObj;
    }));

    res.json({
      programs: programsWithStats,
      total,
      page: Number(page),
      pages: Math.ceil(total / Number(limit))
    });
  } catch (err) {
    console.error('getPrograms error:', err);
    res.status(500).json({ message: err.message });
  }
};

// GET /api/community/welfare/programs/:id
exports.getProgramById = async (req, res) => {
  try {
    const tenant_id = req.user.tenant_id;
    const program = await WelfareProgram.findOne({ _id: req.params.id, tenant_id })
      .populate('created_by', 'name');
    if (!program) return res.status(404).json({ message: 'Program not found' });
    res.json(program);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PUT /api/community/welfare/programs/:id
exports.updateProgram = async (req, res) => {
  try {
    const { program_name, description, budget, funding_source, start_date, end_date, status } = req.body;
    const tenant_id = req.user.tenant_id;

    const program = await WelfareProgram.findOneAndUpdate(
      { _id: req.params.id, tenant_id },
      {
        program_name,
        description,
        budget: budget ? Number(budget) : 0,
        funding_source,
        start_date: start_date || null,
        end_date: end_date || null,
        status
      },
      { new: true, runValidators: true }
    );

    if (!program) return res.status(404).json({ message: 'Program not found' });
    res.json({ message: 'Program updated successfully', program });
  } catch (err) {
    console.error('updateProgram error:', err);
    res.status(500).json({ message: err.message });
  }
};

// DELETE /api/community/welfare/programs/:id
exports.deleteProgram = async (req, res) => {
  try {
    const tenant_id = req.user.tenant_id;
    const program = await WelfareProgram.findOne({ _id: req.params.id, tenant_id });
    if (!program) return res.status(404).json({ message: 'Program not found' });

    // Cascade hard delete: distributions belonging to this program → program
    await WelfareDistribution.deleteMany({ program_id: program._id, tenant_id });
    await WelfareProgram.deleteOne({ _id: program._id, tenant_id });

    res.json({ message: 'Program deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
