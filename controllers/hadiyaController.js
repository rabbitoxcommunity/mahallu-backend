const mongoose = require('mongoose');
const HadiyaCollection = require('../models/HadiyaCollection');
const House = require('../models/House');
const Family = require('../models/Family');
const Member = require('../models/Member');
const generateSequence = require('../utils/generateSequence');

// @desc    Create hadiya collection
// @route   POST /api/finance/hadiya/create
// @access  Private
exports.createHadiyaCollection = async (req, res, next) => {
    try {
        const tenant_id = req.user.tenant_id;
        const created_by = req.user.id;

        const {
            contributor_type,
            house_id,
            contributor_name,
            contributor_place,
            contributor_mobile,
            amount,
            payment_method,
            notes,
            date
        } = req.body;

        if (!contributor_type || !amount || !payment_method) {
            return res.status(400).json({ message: 'Missing required fields' });
        }

        if (amount <= 0) {
            return res.status(400).json({ message: 'Amount must be positive' });
        }

        if (contributor_type === 'house' && !house_id) {
            return res.status(400).json({ message: 'House ID is required for house contributors' });
        }

        const collection_code = await generateSequence(tenant_id, 'hadiya', 'HDY');
        const receipt_no = await generateSequence(tenant_id, 'hadiya_receipt', 'HDR');

        const collection = new HadiyaCollection({
            tenant_id,
            collection_code,
            contributor_type,
            house_id: contributor_type === 'house' ? house_id : null,
            contributor_name: contributor_type === 'external' ? contributor_name : null,
            contributor_place: contributor_type === 'external' ? contributor_place : null,
            contributor_mobile: contributor_type === 'external' ? contributor_mobile : null,
            amount: Number(amount),
            payment_method,
            notes: notes || '',
            created_by,
            date: date ? new Date(date) : new Date(),
            receipt_no
        });

        await collection.save();

        const populatedCollection = await HadiyaCollection.findById(collection._id)
            .populate('house_id', 'house_code householder_name address primary_contact')
            .populate('created_by', 'name');

        res.status(201).json({ message: 'Hadiya collection created successfully', collection: populatedCollection });
    } catch (err) {
        console.error('Error creating hadiya collection:', err);
        res.status(500).json({ message: err.message });
    }
};

// @desc    Get all hadiya collections
// @route   GET /api/finance/hadiya
// @access  Private
exports.getHadiyaCollections = async (req, res, next) => {
    try {
        const { page = 1, limit = 10, search = '', date_from, date_to, contributor_type, payment_method } = req.query;
        const tenant_id = req.user.tenant_id;
        const skip = (Number(page) - 1) * Number(limit);

        const query = { tenant_id, is_active: true };

        if (contributor_type) query.contributor_type = contributor_type;
        if (payment_method) query.payment_method = payment_method;

        if (date_from || date_to) {
            query.date = {};
            if (date_from) query.date.$gte = new Date(date_from);
            if (date_to) query.date.$lte = new Date(date_to);
        }

        if (search) {
            query.$or = [
                { collection_code: { $regex: search, $options: 'i' } },
                { contributor_name: { $regex: search, $options: 'i' } },
                { contributor_place: { $regex: search, $options: 'i' } },
                { contributor_mobile: { $regex: search, $options: 'i' } },
                { notes: { $regex: search, $options: 'i' } }
            ];
        }

        const collections = await HadiyaCollection.find(query)
            .populate('house_id', 'house_code householder_name address primary_contact')
            .populate('created_by', 'name')
            .sort({ date: -1 })
            .skip(skip)
            .limit(Number(limit));

        const total = await HadiyaCollection.countDocuments(query);

        res.json({ collections, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
    } catch (err) {
        console.error('Error fetching hadiya collections:', err);
        res.status(500).json({ message: err.message });
    }
};

// @desc    Get hadiya collection by ID
// @route   GET /api/finance/hadiya/:id
// @access  Private
exports.getHadiyaCollectionById = async (req, res, next) => {
    try {
        const tenant_id = req.user.tenant_id;
        const { id } = req.params;

        const collection = await HadiyaCollection.findOne({ _id: id, tenant_id, is_active: true })
            .populate('house_id', 'house_code householder_name address primary_contact')
            .populate('created_by', 'name');

        if (!collection) {
            return res.status(404).json({ message: 'Collection not found' });
        }

        res.json(collection);
    } catch (err) {
        console.error('Error fetching hadiya collection:', err);
        res.status(500).json({ message: err.message });
    }
};

// @desc    Update hadiya collection
// @route   PUT /api/finance/hadiya/:id
// @access  Private
exports.updateHadiyaCollection = async (req, res, next) => {
    try {
        const tenant_id = req.user.tenant_id;
        const { id } = req.params;
        const { amount, payment_method, notes, date } = req.body;

        const collection = await HadiyaCollection.findOne({ _id: id, tenant_id, is_active: true });
        if (!collection) {
            return res.status(404).json({ message: 'Collection not found' });
        }

        if (amount) collection.amount = Number(amount);
        if (payment_method) collection.payment_method = payment_method;
        if (notes !== undefined) collection.notes = notes;
        if (date) collection.date = new Date(date);

        await collection.save();

        const populatedCollection = await HadiyaCollection.findById(collection._id)
            .populate('house_id', 'house_code householder_name address primary_contact')
            .populate('created_by', 'name');

        res.json({ message: 'Hadiya collection updated successfully', collection: populatedCollection });
    } catch (err) {
        console.error('Error updating hadiya collection:', err);
        res.status(500).json({ message: err.message });
    }
};

// @desc    Delete hadiya collection (soft delete)
// @route   DELETE /api/finance/hadiya/:id
// @access  Private
exports.deleteHadiyaCollection = async (req, res, next) => {
    try {
        const tenant_id = req.user.tenant_id;
        const { id } = req.params;

        const collection = await HadiyaCollection.findOne({ _id: id, tenant_id, is_active: true });
        if (!collection) {
            return res.status(404).json({ message: 'Collection not found' });
        }

        collection.is_active = false;
        await collection.save();

        res.json({ message: 'Hadiya collection deleted successfully' });
    } catch (err) {
        console.error('Error deleting hadiya collection:', err);
        res.status(500).json({ message: err.message });
    }
};

// @desc    Get hadiya summary
// @route   GET /api/finance/hadiya/summary
// @access  Private
exports.getHadiyaSummary = async (req, res, next) => {
    try {
        const tenant_id = req.user.tenant_id;
        const now = new Date();
        const todayStart = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
        const todayEnd = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() + 1));
        const monthStart = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
        const monthEnd = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 1));

        // Today's total
        const todayTotal = await HadiyaCollection.aggregate([
            {
                $match: {
                    tenant_id: new mongoose.Types.ObjectId(tenant_id),
                    is_active: true,
                    date: { $gte: todayStart, $lt: todayEnd }
                }
            },
            {
                $group: {
                    _id: null,
                    total: { $sum: '$amount' },
                    count: { $sum: 1 }
                }
            }
        ]);

        // This month's total
        const monthTotal = await HadiyaCollection.aggregate([
            {
                $match: {
                    tenant_id: new mongoose.Types.ObjectId(tenant_id),
                    is_active: true,
                    date: { $gte: monthStart, $lt: monthEnd }
                }
            },
            {
                $group: {
                    _id: null,
                    total: { $sum: '$amount' },
                    count: { $sum: 1 }
                }
            }
        ]);

        // House contributions total
        const houseTotal = await HadiyaCollection.aggregate([
            {
                $match: {
                    tenant_id: new mongoose.Types.ObjectId(tenant_id),
                    is_active: true,
                    contributor_type: 'house'
                }
            },
            {
                $group: {
                    _id: null,
                    total: { $sum: '$amount' },
                    count: { $sum: 1 }
                }
            }
        ]);

        // External contributions total
        const externalTotal = await HadiyaCollection.aggregate([
            {
                $match: {
                    tenant_id: new mongoose.Types.ObjectId(tenant_id),
                    is_active: true,
                    contributor_type: 'external'
                }
            },
            {
                $group: {
                    _id: null,
                    total: { $sum: '$amount' },
                    count: { $sum: 1 }
                }
            }
        ]);

        res.json({
            today_total: todayTotal[0]?.total || 0,
            today_count: todayTotal[0]?.count || 0,
            month_total: monthTotal[0]?.total || 0,
            month_count: monthTotal[0]?.count || 0,
            house_total: houseTotal[0]?.total || 0,
            house_count: houseTotal[0]?.count || 0,
            external_total: externalTotal[0]?.total || 0,
            external_count: externalTotal[0]?.count || 0
        });
    } catch (err) {
        console.error('Error fetching hadiya summary:', err);
        res.status(500).json({ message: err.message });
    }
};

// @desc    Smart search houses for hadiya collection
// @route   GET /api/houses/search
// @access  Private
exports.searchHouses = async (req, res, next) => {
    try {
        const tenant_id = req.user.tenant_id;
        const { q = '', limit = 20 } = req.query;

        if (!q || q.length < 2) {
            return res.json({ results: [] });
        }

        const query = {
            tenant_id,
            is_active: true
        };

        query.$or = [
            { house_code: { $regex: q, $options: 'i' } },
            { householder_name: { $regex: q, $options: 'i' } },
            { address: { $regex: q, $options: 'i' } },
            { primary_contact: { $regex: q, $options: 'i' } }
        ];

        const houses = await House.find(query)
            .populate('family_id', 'family_name')
            .limit(Number(limit));

        // Also search in members for person names
        const members = await Member.find({
            tenant_id,
            is_active: true,
            $or: [
                { full_name: { $regex: q, $options: 'i' } },
                { contact_number: { $regex: q, $options: 'i' } },
                { whatsapp: { $regex: q, $options: 'i' } }
            ]
        })
            .populate('house_id', 'house_code householder_name address primary_contact')
            .limit(Number(limit));

        // Get unique house IDs from members
        const houseIdsFromMembers = [...new Set(members.map(m => m.house_id._id.toString()))];

        // Fetch full house details for members
        const housesFromMembers = await House.find({
            _id: { $in: houseIdsFromMembers },
            tenant_id,
            is_active: true
        })
            .populate('family_id', 'family_name');

        // Combine results, removing duplicates
        const allHouses = [...houses, ...housesFromMembers];
        const uniqueHouses = allHouses.filter((house, index, self) =>
            index === self.findIndex(h => h._id.toString() === house._id.toString())
        );

        // Format results with rich information
        const results = uniqueHouses.map(house => {
            const headMember = members.find(m => m.house_id._id.toString() === house._id.toString() && m.is_family_head);
            const allHouseMembers = members.filter(m => m.house_id._id.toString() === house._id.toString());

            return {
                house_id: house._id,
                house_code: house.house_code,
                house_name: house.householder_name,
                family_name: house.family_id?.family_name || '',
                head_name: headMember?.full_name || house.householder_name,
                contact: house.primary_contact,
                address: house.address,
                member_names: allHouseMembers.map(m => m.full_name).join(', ')
            };
        });

        res.json({ results });
    } catch (err) {
        console.error('Error searching houses:', err);
        res.status(500).json({ message: err.message });
    }
};
