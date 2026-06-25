const DeathRegistry = require('../models/DeathRegistry');
const Member = require('../models/Member');
const DirectIncome = require('../models/DirectIncome');

// ─── ID Generators ──────────────────────────────────────────────────────────

const generateDeathId = async (tenant_id) => {
    const last = await DeathRegistry.findOne({ tenant_id }, { death_id: 1 })
        .sort({ created_at: -1 })
        .lean();

    let nextNum = 1;
    if (last && last.death_id) {
        const match = last.death_id.match(/\d+$/);
        if (match) nextNum = parseInt(match[0], 10) + 1;
    }

    return `DTH-${String(nextNum).padStart(6, '0')}`;
};

const generateCertificateNo = async (tenant_id) => {
    const last = await DeathRegistry.findOne({ tenant_id }, { certificate_no: 1 })
        .sort({ created_at: -1 })
        .lean();

    let nextNum = 1;
    if (last && last.certificate_no) {
        const match = last.certificate_no.match(/\d+$/);
        if (match) nextNum = parseInt(match[0], 10) + 1;
    }

    return `DCERT-${String(nextNum).padStart(6, '0')}`;
};

const generateIncomeCode = async (tenant_id) => {
    const last = await DirectIncome.findOne({ tenant_id }, { income_code: 1 })
        .sort({ created_at: -1 })
        .lean();

    let nextNum = 1;
    if (last && last.income_code) {
        const match = last.income_code.match(/\d+$/);
        if (match) nextNum = parseInt(match[0], 10) + 1;
    }

    return `INC-${String(nextNum).padStart(4, '0')}`;
};

// ─── Calculate Age ───────────────────────────────────────────────────────────

const calculateAge = (dob, dateOfDeath) => {
    if (!dob || !dateOfDeath) return null;
    const birth = new Date(dob);
    const death = new Date(dateOfDeath);
    let age = death.getFullYear() - birth.getFullYear();
    const monthDiff = death.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && death.getDate() < birth.getDate())) {
        age--;
    }
    return age >= 0 ? age : null;
};

// ─── createDeathRecord ───────────────────────────────────────────────────────

exports.createDeathRecord = async (req, res) => {
    try {
        const tenant_id = req.user.tenant_id;
        const created_by = req.user.id;

        const {
            is_registered_member,
            member_id,
            house_id,
            name,
            gender,
            dob,
            father_name,
            mother_name,
            spouse_name,
            primary_contact,
            date_of_death,
            time_of_death,
            place_of_death,
            cause_of_death,
            hospital,
            janaza_date,
            janaza_time,
            janaza_place,
            imam,
            charge_applicable,
            charge_amount,
            payment_status,
            payment_method,
            notes,
        } = req.body;

        if (!name) return res.status(400).json({ message: 'Name is required' });
        if (!date_of_death) return res.status(400).json({ message: 'Date of death is required' });

        const age = calculateAge(dob, date_of_death);

        const death_id = await generateDeathId(tenant_id);
        const certificate_no = await generateCertificateNo(tenant_id);

        const record = await DeathRegistry.create({
            tenant_id,
            death_id,
            certificate_no,
            is_registered_member: !!is_registered_member,
            member_id: is_registered_member && member_id ? member_id : null,
            house_id: house_id || null,
            name,
            gender,
            dob: dob || null,
            age,
            father_name,
            mother_name,
            spouse_name,
            primary_contact,
            date_of_death,
            time_of_death,
            place_of_death,
            cause_of_death,
            hospital,
            janaza_date: janaza_date || null,
            janaza_time,
            janaza_place,
            imam,
            charge_applicable: !!charge_applicable,
            charge_amount: charge_applicable ? (Number(charge_amount) || 0) : 0,
            payment_status: charge_applicable ? (payment_status || 'pending') : 'pending',
            payment_method: charge_applicable ? (payment_method || 'cash') : undefined,
            notes,
            created_by,
        });

        // Update member if registered
        if (is_registered_member && member_id) {
            await Member.findByIdAndUpdate(member_id, {
                is_deceased: true,
                date_of_death: new Date(date_of_death),
                death_registry_id: record._id,
            });
        }

        // Create income entry if charge applicable
        if (charge_applicable && Number(charge_amount) > 0) {
            const income_code = await generateIncomeCode(tenant_id);
            const income = await DirectIncome.create({
                tenant_id,
                income_code,
                category: 'Burial & Janaza Charges',
                source_name: name,
                amount: Number(charge_amount),
                date: new Date(date_of_death),
                payment_method: payment_method || 'cash',
                receipt_no: death_id,
                description: `Death registry charge for ${name} (${death_id})`,
                created_by,
            });

            await DeathRegistry.findByIdAndUpdate(record._id, {
                income_transaction_id: income._id,
            });
            record.income_transaction_id = income._id;
        }

        const populated = await DeathRegistry.findById(record._id)
            .populate('house_id', 'house_code householder_name primary_contact')
            .populate('member_id', 'full_name contact_number whatsapp')
            .populate('created_by', 'name email')
            .lean();

        return res.status(201).json({ message: 'Death record created successfully', record: populated });
    } catch (err) {
        console.error('createDeathRecord error:', err);
        return res.status(500).json({ message: 'Server error', error: err.message });
    }
};

// ─── getDeathRecords ─────────────────────────────────────────────────────────

exports.getDeathRecords = async (req, res) => {
    try {
        const tenant_id = req.user.tenant_id;
        const {
            page = 1,
            limit = 20,
            search = '',
            gender,
            from_date,
            to_date,
        } = req.query;

        const query = { tenant_id, is_active: true };

        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { death_id: { $regex: search, $options: 'i' } },
                { certificate_no: { $regex: search, $options: 'i' } },
                { primary_contact: { $regex: search, $options: 'i' } },
            ];
        }

        if (gender) query.gender = gender;

        if (from_date || to_date) {
            query.date_of_death = {};
            if (from_date) query.date_of_death.$gte = new Date(from_date);
            if (to_date) {
                const to = new Date(to_date);
                to.setHours(23, 59, 59, 999);
                query.date_of_death.$lte = to;
            }
        }

        const skip = (Number(page) - 1) * Number(limit);
        const [records, total] = await Promise.all([
            DeathRegistry.find(query)
                .sort({ date_of_death: -1 })
                .skip(skip)
                .limit(Number(limit))
                .populate('house_id', 'house_code householder_name')
                .populate('member_id', 'full_name')
                .populate('created_by', 'name')
                .lean(),
            DeathRegistry.countDocuments(query),
        ]);

        const pages = Math.ceil(total / Number(limit));

        return res.json({ records, total, page: Number(page), pages });
    } catch (err) {
        console.error('getDeathRecords error:', err);
        return res.status(500).json({ message: 'Server error', error: err.message });
    }
};

// ─── getDeathById ────────────────────────────────────────────────────────────

exports.getDeathById = async (req, res) => {
    try {
        const tenant_id = req.user.tenant_id;
        const record = await DeathRegistry.findOne({ _id: req.params.id, tenant_id })
            .populate('house_id', 'house_code householder_name primary_contact address')
            .populate('member_id', 'full_name contact_number whatsapp gender dob')
            .populate('income_transaction_id', 'income_code amount payment_method receipt_no')
            .populate('created_by', 'name email')
            .lean();

        if (!record) return res.status(404).json({ message: 'Record not found' });

        return res.json({ record });
    } catch (err) {
        console.error('getDeathById error:', err);
        return res.status(500).json({ message: 'Server error', error: err.message });
    }
};

// ─── updateDeathRecord ───────────────────────────────────────────────────────

exports.updateDeathRecord = async (req, res) => {
    try {
        const tenant_id = req.user.tenant_id;
        const record = await DeathRegistry.findOne({ _id: req.params.id, tenant_id });

        if (!record) return res.status(404).json({ message: 'Record not found' });

        const allowedFields = [
            'place_of_death',
            'cause_of_death',
            'hospital',
            'janaza_date',
            'janaza_time',
            'janaza_place',
            'imam',
            'notes',
            'payment_status',
            'payment_method',
            'time_of_death',
        ];

        const updates = {};
        for (const field of allowedFields) {
            if (req.body[field] !== undefined) updates[field] = req.body[field];
        }

        // If date_of_death changes, update member too
        if (req.body.date_of_death && req.body.date_of_death !== String(record.date_of_death)) {
            updates.date_of_death = new Date(req.body.date_of_death);
            if (record.member_id) {
                await Member.findByIdAndUpdate(record.member_id, {
                    date_of_death: updates.date_of_death,
                });
            }
        }

        const updated = await DeathRegistry.findByIdAndUpdate(
            req.params.id,
            { $set: updates },
            { new: true }
        )
            .populate('house_id', 'house_code householder_name primary_contact')
            .populate('member_id', 'full_name')
            .populate('created_by', 'name')
            .lean();

        return res.json({ message: 'Death record updated successfully', record: updated });
    } catch (err) {
        console.error('updateDeathRecord error:', err);
        return res.status(500).json({ message: 'Server error', error: err.message });
    }
};

// ─── deleteDeathRecord ───────────────────────────────────────────────────────

exports.deleteDeathRecord = async (req, res) => {
    try {
        const tenant_id = req.user.tenant_id;
        const record = await DeathRegistry.findOne({ _id: req.params.id, tenant_id });

        if (!record) return res.status(404).json({ message: 'Record not found' });

        // Soft delete
        record.is_active = false;
        await record.save();

        // Revert member status if linked
        if (record.member_id) {
            await Member.findByIdAndUpdate(record.member_id, {
                is_deceased: false,
                date_of_death: null,
                death_registry_id: null,
            });
        }

        return res.json({ message: 'Death record deleted successfully' });
    } catch (err) {
        console.error('deleteDeathRecord error:', err);
        return res.status(500).json({ message: 'Server error', error: err.message });
    }
};

// ─── markCertificateGenerated ────────────────────────────────────────────────

exports.markCertificateGenerated = async (req, res) => {
    try {
        const tenant_id = req.user.tenant_id;
        const record = await DeathRegistry.findOneAndUpdate(
            { _id: req.params.id, tenant_id },
            { $set: { certificate_generated: true } },
            { new: true }
        ).lean();

        if (!record) return res.status(404).json({ message: 'Record not found' });

        return res.json({ message: 'Certificate marked as generated', record });
    } catch (err) {
        console.error('markCertificateGenerated error:', err);
        return res.status(500).json({ message: 'Server error', error: err.message });
    }
};
