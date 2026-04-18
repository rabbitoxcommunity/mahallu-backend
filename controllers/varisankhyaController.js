const Varisankhya = require("../models/Varisankhya");
const House = require("../models/House");
const mongoose = require("mongoose");

// Generate receipt number
const generateReceiptNo = (tenantId, year) => {
    const timestamp = Date.now().toString(36).toUpperCase();
    return `RCP-${year}-${timestamp}`;
};

// @desc    Generate monthly varisankhya dues for all active houses
// @route   POST /api/finance/varisankhya/generate
// @access  Private
exports.generateMonthlyDues = async (req, res) => {
    try {
        const { month, year, default_amount = 200 } = req.body;
        const tenant_id = req.user.tenant_id;

        if (!month || !year) {
            return res.status(400).json({ message: "Month and year are required" });
        }

        // Get all active houses for this tenant
        const houses = await House.find({
            tenant_id,
            is_active: true,
        });

        if (houses.length === 0) {
            return res.status(404).json({ message: "No active houses found" });
        }

        let created = 0;
        let skipped = 0;
        const results = [];

        // Generate dues for each house
        for (const house of houses) {
            try {
                // Check if due already exists
                const existingDue = await Varisankhya.findOne({
                    tenant_id,
                    house_id: house._id,
                    month,
                    year,
                });

                if (existingDue) {
                    skipped++;
                    results.push({
                        house_id: house._id,
                        house_code: house.house_code,
                        status: "skipped",
                        reason: "Already exists",
                    });
                    continue;
                }

                // Create new due
                const varisankhya = await Varisankhya.create({
                    tenant_id,
                    house_id: house._id,
                    month,
                    year,
                    amount_due: default_amount,
                    amount_paid: 0,
                    status: "unpaid",
                });

                created++;
                results.push({
                    house_id: house._id,
                    house_code: house.house_code,
                    status: "created",
                    varisankhya_id: varisankhya._id,
                });
            } catch (err) {
                results.push({
                    house_id: house._id,
                    house_code: house.house_code,
                    status: "error",
                    error: err.message,
                });
            }
        }

        res.json({
            message: "Monthly dues generation completed",
            summary: {
                total_houses: houses.length,
                created,
                skipped,
            },
            results,
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// @desc    Get monthly varisankhya list
// @route   GET /api/finance/varisankhya?month=5&year=2026
// @access  Private
exports.getMonthlyVarisankhya = async (req, res) => {
    try {
        const { month, year, page = 1, limit = 20, search = "" } = req.query;
        const tenant_id = req.user.tenant_id;

        if (!month || !year) {
            return res.status(400).json({ message: "Month and year are required" });
        }

        const skip = (Number(page) - 1) * Number(limit);

        // Build query
        let query = {
            tenant_id,
            month: Number(month),
            year: Number(year),
        };

        // If search is provided, we need to filter by house details
        let houseQuery = { tenant_id, is_active: true };
        if (search) {
            houseQuery.$or = [
                { house_code: { $regex: search, $options: "i" } },
                { householder_name: { $regex: search, $options: "i" } },
            ];
        }

        // Get houses matching search
        const matchingHouses = await House.find(houseQuery).select("_id");
        const houseIds = matchingHouses.map((h) => h._id);

        query.house_id = { $in: houseIds };

        // Get varisankhya records with populated house data
        const varisankhyaList = await Varisankhya.find(query)
            .populate("house_id", "house_code householder_name primary_contact family_id")
            .populate("received_by", "name")
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(Number(limit));

        // Populate family details
        const populatedList = await Promise.all(
            varisankhyaList.map(async (record) => {
                const recordObj = record.toObject();
                if (recordObj.house_id && recordObj.house_id.family_id) {
                    const Family = require("../models/Family");
                    const family = await Family.findById(recordObj.house_id.family_id).select("family_name");
                    recordObj.house_id.family_name = family?.family_name || "";
                }
                return recordObj;
            })
        );

        const total = await Varisankhya.countDocuments(query);

        // Get total active houses for this tenant
        const totalActiveHouses = await House.countDocuments({ tenant_id, is_active: true });

        // Get all varisankhya records for this month/year (respecting search filters)
        const allVarisankhya = await Varisankhya.find({
            tenant_id,
            month: Number(month),
            year: Number(year),
            house_id: { $in: houseIds }
        }).select('status amount_due amount_paid');

        // Calculate summary manually - this counts ALL houses including those without records
        let paidCount = 0;
        let unpaidCount = 0;
        let partialCount = 0;
        let totalExpected = 0;
        let totalCollected = 0;

        // Count houses with varisankhya records
        for (const v of allVarisankhya) {
            totalExpected += v.amount_due;
            totalCollected += v.amount_paid;

            if (v.status === 'paid') paidCount++;
            else if (v.status === 'unpaid') unpaidCount++;
            else if (v.status === 'partial') partialCount++;
        }

        // Houses without varisankhya records are also "unpaid"
        // Add the difference to unpaid count
        const housesWithRecords = allVarisankhya.length;
        const housesWithoutRecords = totalActiveHouses - housesWithRecords;
        unpaidCount += housesWithoutRecords;

        // Add expected amount for houses without records (default 200)
        const defaultAmount = 200;
        totalExpected += housesWithoutRecords * defaultAmount;

        res.json({
            varisankhya: populatedList,
            total,
            page: Number(page),
            pages: Math.ceil(total / Number(limit)),
            summary: {
                total_houses: totalActiveHouses,
                paid_houses: paidCount,
                unpaid_houses: unpaidCount + partialCount,
                total_expected: totalExpected,
                total_collected: totalCollected,
                pending_amount: totalExpected - totalCollected,
            },
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// @desc    Mark payment for varisankhya
// @route   PUT /api/finance/varisankhya/pay/:id
// @access  Private
exports.markPayment = async (req, res) => {
    try {
        const { id } = req.params;
        const { amount_paid, payment_method, notes } = req.body;
        const tenant_id = req.user.tenant_id;
        const received_by = req.user.id;

        if (amount_paid === undefined || amount_paid === null) {
            return res.status(400).json({ message: "Amount paid is required" });
        }

        const varisankhya = await Varisankhya.findOne({
            _id: id,
            tenant_id,
        });

        if (!varisankhya) {
            return res.status(404).json({ message: "Varisankhya record not found" });
        }

        // Calculate new status
        let status = "unpaid";
        if (Number(amount_paid) >= varisankhya.amount_due) {
            status = "paid";
        } else if (Number(amount_paid) > 0) {
            status = "partial";
        }

        // Update record
        varisankhya.amount_paid = Number(amount_paid);
        varisankhya.status = status;
        varisankhya.payment_method = payment_method || (Number(amount_paid) > 0 ? "cash" : null);
        varisankhya.received_by = received_by;
        varisankhya.notes = notes || varisankhya.notes;

        if (Number(amount_paid) > 0 && !varisankhya.paid_date) {
            varisankhya.paid_date = new Date();
        }

        // Generate receipt number if payment is made and no receipt exists
        if (Number(amount_paid) > 0 && !varisankhya.receipt_no) {
            varisankhya.receipt_no = generateReceiptNo(tenant_id, varisankhya.year);
        }

        await varisankhya.save();

        // Populate and return updated record
        const populatedRecord = await Varisankhya.findById(varisankhya._id)
            .populate("house_id", "house_code householder_name primary_contact family_id")
            .populate("received_by", "name");

        const recordObj = populatedRecord.toObject();
        if (recordObj.house_id && recordObj.house_id.family_id) {
            const Family = require("../models/Family");
            const family = await Family.findById(recordObj.house_id.family_id).select("family_name");
            recordObj.house_id.family_name = family?.family_name || "";
        }

        res.json({
            message: "Payment recorded successfully",
            varisankhya: recordObj,
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// @desc    Get defaulters list
// @route   GET /api/finance/varisankhya/defaulters
// @access  Private
exports.getDefaulters = async (req, res) => {
    try {
        const { year, page = 1, limit = 20 } = req.query;
        const tenant_id = req.user.tenant_id;
        const currentYear = year ? Number(year) : new Date().getFullYear();

        const skip = (Number(page) - 1) * Number(limit);

        // Get all active houses
        const houses = await House.find({ tenant_id, is_active: true });

        // Get all unpaid/partial records for this year
        const defaulterRecords = await Varisankhya.find({
            tenant_id,
            year: currentYear,
            status: { $in: ["unpaid", "partial"] },
        }).populate("house_id", "house_code householder_name primary_contact family_id");

        // Group by house
        const houseDefaulters = {};

        for (const record of defaulterRecords) {
            const houseId = record.house_id._id.toString();
            if (!houseDefaulters[houseId]) {
                const Family = require("../models/Family");
                const family = await Family.findById(record.house_id.family_id).select("family_name");

                houseDefaulters[houseId] = {
                    house_id: record.house_id._id,
                    house_code: record.house_id.house_code,
                    house_name: record.house_id.householder_name,
                    family_name: family?.family_name || "",
                    contact: record.house_id.primary_contact,
                    pending_months: [],
                    total_due: 0,
                    total_paid: 0,
                };
            }

            houseDefaulters[houseId].pending_months.push(record.month);
            houseDefaulters[houseId].total_due += record.amount_due;
            houseDefaulters[houseId].total_paid += record.amount_paid;
        }

        // Convert to array and calculate pending amounts
        let defaultersList = Object.values(houseDefaulters).map((d) => ({
            ...d,
            pending_amount: d.total_due - d.total_paid,
            pending_months_count: d.pending_months.length,
        }));

        // Sort by pending amount (highest first)
        defaultersList.sort((a, b) => b.pending_amount - a.pending_amount);

        const total = defaultersList.length;

        // Paginate
        defaultersList = defaultersList.slice(skip, skip + Number(limit));

        res.json({
            defaulters: defaultersList,
            total,
            page: Number(page),
            pages: Math.ceil(total / Number(limit)),
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// @desc    Get house payment history
// @route   GET /api/finance/varisankhya/house/:houseId
// @access  Private
exports.getHousePaymentHistory = async (req, res) => {
    try {
        const { houseId } = req.params;
        const { page = 1, limit = 20, year } = req.query;
        const tenant_id = req.user.tenant_id;

        const skip = (Number(page) - 1) * Number(limit);

        // Verify house belongs to tenant
        const house = await House.findOne({
            _id: houseId,
            tenant_id,
        });

        if (!house) {
            return res.status(404).json({ message: "House not found" });
        }

        // Build query
        let query = {
            tenant_id,
            house_id: houseId,
        };

        if (year) {
            query.year = Number(year);
        }

        // Build summary match query — try string first, fallback to ObjectId
        let summaryMatchQuery = {
            tenant_id: tenant_id,
            house_id: houseId,
            ...(year && { year: Number(year) }),
        };

        console.log('summaryMatchQuery:', JSON.stringify(summaryMatchQuery, null, 2));

        const [history, total, summary] = await Promise.all([
            Varisankhya.find(query)
                .populate("received_by", "name")
                .sort({ year: -1, month: -1 })
                .skip(skip)
                .limit(Number(limit)),

            Varisankhya.countDocuments(query),

            Varisankhya.aggregate([
                { $match: summaryMatchQuery },
                {
                    $group: {
                        _id: null,
                        total_due: { $sum: "$amount_due" },
                        total_paid: { $sum: "$amount_paid" },
                        payments_count: {
                            $sum: { $cond: [{ $gt: ["$amount_paid", 0] }, 1, 0] },
                        },
                    },
                },
            ]),
        ]);

        console.log('summary result:', summary);

        // If summary is empty, try with ObjectId conversion
        let summaryData = summary[0];
        if (!summaryData) {
            console.log('Retrying summary with ObjectId conversion...');
            const summaryWithObjectId = await Varisankhya.aggregate([
                {
                    $match: {
                        tenant_id: new mongoose.Types.ObjectId(tenant_id),
                        house_id: new mongoose.Types.ObjectId(houseId),
                        ...(year && { year: Number(year) }),
                    }
                },
                {
                    $group: {
                        _id: null,
                        total_due: { $sum: "$amount_due" },
                        total_paid: { $sum: "$amount_paid" },
                        payments_count: {
                            $sum: { $cond: [{ $gt: ["$amount_paid", 0] }, 1, 0] },
                        },
                    },
                },
            ]);
            console.log('summaryWithObjectId result:', summaryWithObjectId);
            summaryData = summaryWithObjectId[0];
        }

        res.json({
            house: {
                _id: house._id,
                house_code: house.house_code,
                householder_name: house.householder_name,
                primary_contact: house.primary_contact,
            },
            history,
            total,
            page: Number(page),
            pages: Math.ceil(total / Number(limit)),
            summary: summaryData || { total_due: 0, total_paid: 0, payments_count: 0 },
        });

    } catch (err) {
        console.error('getHousePaymentHistory error:', err);
        res.status(500).json({ message: err.message });
    }
};

// @desc    Get defaulter history for a specific house
// @route   GET /api/finance/varisankhya/defaulter/:houseId
// @access  Private
exports.getDefaulterHistory = async (req, res) => {
    try {
        const { houseId } = req.params;
        const { page = 1, limit = 20, year } = req.query;
        const tenant_id = req.user.tenant_id;

        const skip = (Number(page) - 1) * Number(limit);

        // Verify house belongs to tenant
        const house = await House.findOne({
            _id: houseId,
            tenant_id,
        });

        if (!house) {
            return res.status(404).json({ message: "House not found" });
        }

        // Build query
        let query = {
            tenant_id,
            house_id: houseId,
            status: { $in: ["unpaid", "partial"] },
        };

        if (year) {
            query.year = Number(year);
        }

        const history = await Varisankhya.find(query)
            .populate("received_by", "name")
            .sort({ year: -1, month: -1 })
            .skip(skip)
            .limit(Number(limit));

        const total = await Varisankhya.countDocuments(query);

        // Calculate summary with year filter
        let summaryMatchQuery = {
            tenant_id: tenant_id,
            house_id: houseId,
            status: { $in: ["unpaid", "partial"] },
            ...(year && { year: Number(year) }),
        };

        console.log('defaulter summaryMatchQuery:', JSON.stringify(summaryMatchQuery, null, 2));

        const summary = await Varisankhya.aggregate([
            { $match: summaryMatchQuery },
            {
                $group: {
                    _id: null,
                    total_due: { $sum: "$amount_due" },
                    total_paid: { $sum: "$amount_paid" },
                    pending_amount: { $sum: { $subtract: ["$amount_due", "$amount_paid"] } },
                    payments_count: {
                        $sum: { $cond: [{ $gt: ["$amount_paid", 0] }, 1, 0] },
                    },
                    pending_months_count: { $sum: 1 },
                },
            },
        ]);

        console.log('defaulter summary result:', summary);

        // If summary is empty, try with ObjectId conversion
        let summaryData = summary[0];
        if (!summaryData) {
            console.log('Retrying defaulter summary with ObjectId conversion...');
            const summaryWithObjectId = await Varisankhya.aggregate([
                {
                    $match: {
                        tenant_id: new mongoose.Types.ObjectId(tenant_id),
                        house_id: new mongoose.Types.ObjectId(houseId),
                        status: { $in: ["unpaid", "partial"] },
                        ...(year && { year: Number(year) }),
                    }
                },
                {
                    $group: {
                        _id: null,
                        total_due: { $sum: "$amount_due" },
                        total_paid: { $sum: "$amount_paid" },
                        pending_amount: { $sum: { $subtract: ["$amount_due", "$amount_paid"] } },
                        payments_count: {
                            $sum: { $cond: [{ $gt: ["$amount_paid", 0] }, 1, 0] },
                        },
                        pending_months_count: { $sum: 1 },
                    },
                },
            ]);
            console.log('defaulter summaryWithObjectId result:', summaryWithObjectId);
            summaryData = summaryWithObjectId[0];
        }

        res.json({
            house: {
                _id: house._id,
                house_code: house.house_code,
                householder_name: house.householder_name,
                primary_contact: house.primary_contact,
            },
            history,
            total,
            page: Number(page),
            pages: Math.ceil(total / Number(limit)),
            summary: summaryData || { 
                total_due: 0, 
                total_paid: 0, 
                pending_amount: 0, 
                payments_count: 0, 
                pending_months_count: 0 
            },
        });
    } catch (err) {
        console.error('getDefaulterHistory error:', err);
        res.status(500).json({ message: err.message });
    }
};

// @desc    Get payment history (all payments across all houses)
// @route   GET /api/finance/varisankhya/payment-history
// @access  Private
exports.getPaymentHistory = async (req, res) => {
    try {
        // 1. Extract request params
        const { page = 1, limit = 20, search = "", from_date, to_date, date_filter, year } = req.query;
        
        // 2. Extract user info
        const tenant_id = req.user.tenant_id;

        // 3. Pagination
        const skip = (Number(page) - 1) * Number(limit);

        // 4. Date variables
        const now = new Date();
        const filterYear = year ? Number(year) : now.getFullYear();
        const filterMonth = now.getMonth();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        // 5. Build base query
        let query = {
            tenant_id,
            amount_paid: { $gt: 0 },
        };

        // 6. Apply date filter to query
        if (year && !date_filter && !from_date && !to_date) {
            // If only year is provided, filter by that year
            query.paid_date = {
                $gte: new Date(filterYear, 0, 1),
                $lt: new Date(filterYear + 1, 0, 1),
            };
        } else if (date_filter) {
            switch (date_filter) {
                case 'today':
                    query.paid_date = { $gte: today, $lt: tomorrow };
                    break;
                case 'this_month':
                    query.paid_date = {
                        $gte: new Date(filterYear, filterMonth, 1),
                        $lt: new Date(filterYear, filterMonth + 1, 1),
                    };
                    break;
                case 'last_month':
                    query.paid_date = {
                        $gte: new Date(filterYear, filterMonth - 1, 1),
                        $lt: new Date(filterYear, filterMonth, 1),
                    };
                    break;
                case 'this_year':
                    query.paid_date = {
                        $gte: new Date(filterYear, 0, 1),
                        $lt: new Date(filterYear + 1, 0, 1),
                    };
                    break;
                case 'custom':
                    if (from_date || to_date) {
                        query.paid_date = {};
                        if (from_date) {
                            const fromDate = new Date(from_date);
                            fromDate.setHours(0, 0, 0, 0);
                            query.paid_date.$gte = fromDate;
                        }
                        if (to_date) {
                            const toDate = new Date(to_date);
                            toDate.setHours(23, 59, 59, 999);
                            query.paid_date.$lte = toDate;
                        }
                    }
                    break;
                default:
                    break;
            }
        } else if (from_date || to_date) {
            // Custom date range
            query.paid_date = {};
            if (from_date) {
                const fromDate = new Date(from_date);
                fromDate.setHours(0, 0, 0, 0);
                query.paid_date.$gte = fromDate;
            }
            if (to_date) {
                const toDate = new Date(to_date);
                toDate.setHours(23, 59, 59, 999);
                query.paid_date.$lte = toDate;
            }
        }

        // 7. Apply search filter
        if (search) {
            const matchingHouses = await House.find({
                tenant_id,
                $or: [
                    { house_code: { $regex: search, $options: "i" } },
                    { householder_name: { $regex: search, $options: "i" } },
                ],
            }).select("_id");
            query.house_id = { $in: matchingHouses.map((h) => h._id) };
        }

        // 8. Run queries AFTER query object is fully built
        const [total, allMatchingPayments] = await Promise.all([
            Varisankhya.countDocuments(query),
            Varisankhya.find(query).select("amount_paid"),
        ]);

        // 9. Calculate total collected
        const totalCollected = allMatchingPayments.reduce((sum, p) => sum + (Number(p.amount_paid) || 0), 0);

        // 10. Fetch paginated results
        const payments = await Varisankhya.find(query)
            .populate("house_id", "house_code householder_name primary_contact family_id")
            .populate("received_by", "name")
            .sort({ paid_date: -1 })
            .skip(skip)
            .limit(Number(limit));

        // 11. Populate family details
        const Family = require("../models/Family");
        const populatedPayments = await Promise.all(
            payments.map(async (record) => {
                const recordObj = record.toObject();
                if (recordObj.house_id?.family_id) {
                    const family = await Family.findById(recordObj.house_id.family_id).select("family_name");
                    recordObj.house_id.family_name = family?.family_name || "";
                }
                return recordObj;
            })
        );

        // 12. Send response
        res.json({
            payments: populatedPayments,
            total,
            page: Number(page),
            pages: Math.ceil(total / Number(limit)),
            total_collected: totalCollected,
        });

    } catch (err) {
        console.error('getPaymentHistory error:', err);
        res.status(500).json({ message: err.message });
    }
};
