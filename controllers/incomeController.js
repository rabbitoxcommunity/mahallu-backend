const mongoose = require('mongoose');
const DueBasedIncome = require('../models/DueBasedIncome');
const DueBasedEntry = require('../models/DueBasedEntry');
const DirectIncome = require('../models/DirectIncome');
const IncomePayment = require('../models/IncomePayment');
const { generateDueIncomeCode, generateDirectIncomeCode, generateReceiptNo, updateOverdueStatus } = require('../utils/incomeUtils');

// ==================== HELPERS ====================

/**
 * Auto-generate monthly entries for a template from its start date up to (upToMonth, upToYear).
 * Already-existing entries are skipped (idempotent).
 */
const generateEntriesUpTo = async (template, upToMonth, upToYear) => {
    const existing = await DueBasedEntry.find({
        tenant_id: template.tenant_id,
        template_id: template._id,
    }).select('month year');

    const existingSet = new Set(existing.map(e => `${e.year}-${e.month}`));

    const toCreate = [];
    let m = template.start_month;
    let y = template.start_year;
    const now = new Date();

    while (y < upToYear || (y === upToYear && m <= upToMonth)) {
        const key = `${y}-${m}`;
        if (!existingSet.has(key)) {
            const dueDate = new Date(y, m - 1, 28);
            const status = dueDate < now ? 'overdue' : 'unpaid';
            toCreate.push({
                tenant_id: template.tenant_id,
                template_id: template._id,
                month: m,
                year: y,
                amount_due: template.amount_due,
                amount_paid: 0,
                balance: template.amount_due,
                status,
                due_date: dueDate,
            });
        }
        m++;
        if (m > 12) { m = 1; y++; }
    }

    if (toCreate.length > 0) {
        await DueBasedEntry.insertMany(toCreate, { ordered: false });
    }
};

// ==================== DUE BASED INCOME CONTROLLERS ====================

// @desc    Create due-based income subscription template
// @route   POST /api/finance/income/due/create
// @access  Private
exports.createDueIncome = async (req, res) => {
    try {
        const tenant_id = req.user.tenant_id;
        const created_by = req.user.id;

        const { category, source_name, whatsapp, start_month, start_year, amount_due, notes } = req.body;

        if (!category || !source_name || !start_month || !start_year || !amount_due) {
            return res.status(400).json({ message: 'Missing required fields' });
        }

        if (Number(amount_due) <= 0) {
            return res.status(400).json({ message: 'Amount due must be positive' });
        }

        const income_code = await generateDueIncomeCode(tenant_id);

        const template = new DueBasedIncome({
            tenant_id,
            income_code,
            category,
            source_name,
            whatsapp: whatsapp || '',
            amount_due: Number(amount_due),
            start_month: Number(start_month),
            start_year: Number(start_year),
            notes: notes || '',
            created_by,
        });

        await template.save();

        // Auto-generate entries from start up to current month
        const now = new Date();
        const currentMonth = now.getMonth() + 1;
        const currentYear = now.getFullYear();

        const startM = Number(start_month);
        const startY = Number(start_year);

        // Only generate if start is not in the future
        if (startY < currentYear || (startY === currentYear && startM <= currentMonth)) {
            await generateEntriesUpTo(template, currentMonth, currentYear);
        }

        res.status(201).json({ message: 'Due-based income subscription created successfully', income: template });
    } catch (err) {
        console.error('Error creating due income:', err);
        res.status(500).json({ message: err.message });
    }
};

// @desc    Get due-based income subscriptions with their entry for the selected month/year
// @route   GET /api/finance/income/due
// @access  Private
exports.getDueIncome = async (req, res) => {
    try {
        const { page = 1, limit = 10, search = '', category, status, month, year } = req.query;
        const tenant_id = req.user.tenant_id;

        const now = new Date();
        const viewMonth = month ? Number(month) : now.getMonth() + 1;
        const viewYear  = year  ? Number(year)  : now.getFullYear();
        const currentMonth = now.getMonth() + 1;
        const currentYear  = now.getFullYear();

        // Build template filter
        const templateQuery = { tenant_id, is_active: true };
        if (category) templateQuery.category = category;
        if (search) {
            templateQuery.$or = [
                { source_name: { $regex: search, $options: 'i' } },
                { income_code:  { $regex: search, $options: 'i' } },
            ];
        }

        const templates = await DueBasedIncome.find(templateQuery).sort({ created_at: -1 });

        // Auto-generate entries up to current month for all templates
        for (const tpl of templates) {
            const tplStartBeforeCurrent =
                tpl.start_year < currentYear ||
                (tpl.start_year === currentYear && tpl.start_month <= currentMonth);
            if (tplStartBeforeCurrent) {
                await generateEntriesUpTo(tpl, currentMonth, currentYear);
            }
        }

        // Fetch entries for the requested view month/year
        const templateIds = templates.map(t => t._id);
        const entries = await DueBasedEntry.find({
            tenant_id,
            template_id: { $in: templateIds },
            month: viewMonth,
            year: viewYear,
        });

        const entryMap = {};
        entries.forEach(e => { entryMap[e.template_id.toString()] = e; });

        // Merge template + entry, filter by entry status if requested
        let merged = templates.map(t => ({
            ...t.toObject(),
            entry: entryMap[t._id.toString()] || null,
        }));

        if (status) {
            merged = merged.filter(t => (t.entry?.status ?? 'upcoming') === status);
        }

        const total = merged.length;
        const skip  = (Number(page) - 1) * Number(limit);
        const paginated = merged.slice(skip, skip + Number(limit));

        res.json({
            incomes: paginated,
            total,
            page: Number(page),
            pages: Math.ceil(total / Number(limit)),
            view_month: viewMonth,
            view_year:  viewYear,
        });
    } catch (err) {
        console.error('Error fetching due income:', err);
        res.status(500).json({ message: err.message });
    }
};

// @desc    Update due-based income template
// @route   PUT /api/finance/income/due/:id
// @access  Private
exports.updateDueIncome = async (req, res) => {
    try {
        const tenant_id = req.user.tenant_id;
        const { id } = req.params;
        const { category, source_name, whatsapp, amount_due, notes } = req.body;

        const existing = await DueBasedIncome.findOne({ _id: id, tenant_id, is_active: true });
        if (!existing) return res.status(404).json({ message: 'Income record not found' });

        const $set = { updated_by: req.user.id };
        if (category               !== undefined) $set.category    = category;
        if (source_name            !== undefined) $set.source_name = source_name;
        if (whatsapp               !== undefined) $set.whatsapp    = whatsapp;
        if (notes                  !== undefined) $set.notes       = notes;
        if (amount_due             !== undefined) $set.amount_due  = Number(amount_due);

        await DueBasedIncome.updateOne({ _id: id }, { $set });

        if (amount_due !== undefined) {
            const now = new Date();
            await DueBasedEntry.updateMany(
                {
                    tenant_id,
                    template_id: id,
                    status: { $in: ['unpaid', 'overdue'] },
                    $or: [
                        { year: { $gt: now.getFullYear() } },
                        { year: now.getFullYear(), month: { $gte: now.getMonth() + 1 } },
                    ],
                },
                { $set: { amount_due: Number(amount_due), balance: Number(amount_due) } }
            );
        }

        const updated = await DueBasedIncome.findById(id);
        res.json({ message: 'Due-based income updated successfully', income: updated });
    } catch (err) {
        console.error('Error updating due income:', err);
        res.status(500).json({ message: err.message });
    }
};

// @desc    Deactivate (soft-delete) due-based income template
// @route   DELETE /api/finance/income/due/:id
// @access  Private
exports.deleteDueIncome = async (req, res) => {
    try {
        const tenant_id = req.user.tenant_id;
        const { id } = req.params;

        const result = await DueBasedIncome.updateOne(
            { _id: id, tenant_id, is_active: true },
            { $set: { is_active: false } }
        );
        if (result.matchedCount === 0) return res.status(404).json({ message: 'Income record not found' });

        await DueBasedEntry.updateMany(
            { template_id: id, tenant_id },
            { $set: { is_active: false } }
        );

        res.json({ message: 'Due-based income subscription deactivated successfully' });
    } catch (err) {
        console.error('Error deleting due income:', err);
        res.status(500).json({ message: err.message });
    }
};

// @desc    Mark payment against a monthly entry
// @route   PUT /api/finance/income/due/pay/:id   (id = entry._id)
// @access  Private
exports.markDuePayment = async (req, res) => {
    try {
        const tenant_id = req.user.tenant_id;
        const { id } = req.params;       // entry_id
        const received_by = req.user.id;

        const { payment_amount, payment_method, reference_no, notes } = req.body;

        if (!payment_amount || Number(payment_amount) <= 0) {
            return res.status(400).json({ message: 'Payment amount must be positive' });
        }

        const entry = await DueBasedEntry.findOne({ _id: id, tenant_id, is_active: true });
        if (!entry) return res.status(404).json({ message: 'Entry not found' });

        const newTotalPaid = (entry.amount_paid || 0) + Number(payment_amount);

        if (newTotalPaid > entry.amount_due) {
            return res.status(400).json({
                message: 'Payment exceeds due amount',
                details: {
                    amount_due: entry.amount_due,
                    previous_paid: entry.amount_paid,
                    new_payment: Number(payment_amount),
                    excess: newTotalPaid - entry.amount_due,
                },
            });
        }

        const receipt_no = await generateReceiptNo(tenant_id);

        const payment = new IncomePayment({
            tenant_id,
            entry_id: entry._id,
            payment_amount: Number(payment_amount),
            payment_method: payment_method || 'cash',
            payment_date: new Date(),
            reference_no: reference_no || '',
            notes: notes || '',
            receipt_no,
            received_by,
        });

        await payment.save();

        const newBalance = entry.amount_due - newTotalPaid;
        let newStatus = newBalance <= 0 ? 'paid' : newTotalPaid > 0 ? 'partial' : 'unpaid';
        if (newStatus !== 'paid' && entry.due_date && entry.due_date < new Date()) {
            newStatus = 'overdue';
        }

        entry.amount_paid    = newTotalPaid;
        entry.balance        = newBalance;
        entry.status         = newStatus;
        entry.payment_method = payment_method || 'cash';
        entry.receipt_no     = receipt_no;
        await entry.save();

        res.json({
            message: 'Payment recorded successfully',
            entry,
            payment,
            payment_details: {
                this_payment:  Number(payment_amount),
                previous_paid: entry.amount_paid - Number(payment_amount),
                total_paid:    newTotalPaid,
                amount_due:    entry.amount_due,
                remaining:     newBalance,
                status:        newStatus,
            },
        });
    } catch (err) {
        console.error('Error marking payment:', err);
        res.status(500).json({ message: err.message });
    }
};

// @desc    Get payment history for a monthly entry
// @route   GET /api/finance/income/due/history/:id  (id = entry._id)
// @access  Private
exports.getDuePaymentHistory = async (req, res) => {
    try {
        const tenant_id = req.user.tenant_id;
        const { id } = req.params;   // entry_id

        const entry = await DueBasedEntry.findOne({ _id: id, tenant_id });
        if (!entry) return res.status(404).json({ message: 'Entry not found' });

        const payments = await IncomePayment.find({ tenant_id, entry_id: id })
            .populate('received_by', 'name')
            .sort({ payment_date: -1 });

        res.json({
            entry_id: id,
            payments,
            total_payments: payments.length,
            total_paid: payments.reduce((s, p) => s + p.payment_amount, 0),
        });
    } catch (err) {
        console.error('Error fetching payment history:', err);
        res.status(500).json({ message: err.message });
    }
};

// @desc    Get all monthly entries for a template (subscription history across months)
// @route   GET /api/finance/income/due/:id/entries
// @access  Private
exports.getTemplateEntries = async (req, res) => {
    try {
        const tenant_id = req.user.tenant_id;
        const { id } = req.params;   // template_id

        const template = await DueBasedIncome.findOne({ _id: id, tenant_id });
        if (!template) return res.status(404).json({ message: 'Template not found' });

        const entries = await DueBasedEntry.find({ tenant_id, template_id: id })
            .sort({ year: -1, month: -1 });

        res.json({ template, entries });
    } catch (err) {
        console.error('Error fetching template entries:', err);
        res.status(500).json({ message: err.message });
    }
};

// ==================== DIRECT INCOME CONTROLLERS ====================

// @desc    Create direct income record
// @route   POST /api/finance/income/direct/create
// @access  Private
exports.createDirectIncome = async (req, res) => {
    try {
        const tenant_id = req.user.tenant_id;
        const created_by = req.user.id;

        const { category, source_name, amount, date, payment_method, reference_no, description } = req.body;

        if (!category || !source_name || !amount) {
            return res.status(400).json({ message: 'Missing required fields' });
        }

        const parsedAmount = Number(amount);
        if (isNaN(parsedAmount) || parsedAmount <= 0) {
            return res.status(400).json({ message: 'Amount must be a positive number' });
        }

        const income_code = await generateDirectIncomeCode(tenant_id);
        const receipt_no  = await generateReceiptNo(tenant_id);

        const income = new DirectIncome({
            tenant_id,
            income_code,
            category,
            source_name,
            amount: parsedAmount,
            date:   date ? new Date(date) : new Date(),
            payment_method: payment_method || 'cash',
            reference_no:   reference_no   || '',
            description:    description    || '',
            receipt_no,
            created_by,
        });

        await income.save();
        res.status(201).json({ message: 'Direct income recorded successfully', income });
    } catch (err) {
        console.error('Error creating direct income:', err);
        res.status(500).json({ message: err.message });
    }
};

// @desc    Get all direct income records
// @route   GET /api/finance/income/direct
// @access  Private
exports.getDirectIncome = async (req, res) => {
    try {
        const { page = 1, limit = 10, search = '', category, payment_method, month, year } = req.query;
        const tenant_id = req.user.tenant_id;
        const skip = (Number(page) - 1) * Number(limit);

        const query = { tenant_id, is_active: true };

        if (category)       query.category       = category;
        if (payment_method) query.payment_method = payment_method;

        if (month || year) {
            const now = new Date();
            const y   = year  ? Number(year)  : now.getFullYear();
            const m   = month ? Number(month) : null;
            if (m) {
                query.date = { $gte: new Date(y, m - 1, 1), $lt: new Date(y, m, 1) };
            } else {
                query.date = { $gte: new Date(y, 0, 1), $lt: new Date(y + 1, 0, 1) };
            }
        }

        if (search) {
            query.$or = [
                { source_name: { $regex: search, $options: 'i' } },
                { income_code: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } },
            ];
        }

        const incomes = await DirectIncome.find(query).sort({ date: -1 }).skip(skip).limit(Number(limit));
        const total   = await DirectIncome.countDocuments(query);

        res.json({ incomes, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
    } catch (err) {
        console.error('Error fetching direct income:', err);
        res.status(500).json({ message: err.message });
    }
};

// @desc    Update direct income record
// @route   PUT /api/finance/income/direct/:id
// @access  Private
exports.updateDirectIncome = async (req, res) => {
    try {
        const tenant_id = req.user.tenant_id;
        const { id } = req.params;
        const { category, source_name, amount, date, payment_method, reference_no, description } = req.body;

        const income = await DirectIncome.findOne({ _id: id, tenant_id, is_active: true });
        if (!income) return res.status(404).json({ message: 'Income record not found' });

        if (category)              income.category       = category;
        if (source_name)           income.source_name    = source_name;
        if (amount)                income.amount         = Number(amount);
        if (date)                  income.date           = new Date(date);
        if (payment_method)        income.payment_method = payment_method;
        if (reference_no !== undefined) income.reference_no = reference_no;
        if (description  !== undefined) income.description  = description;

        await income.save();
        res.json({ message: 'Direct income updated successfully', income });
    } catch (err) {
        console.error('Error updating direct income:', err);
        res.status(500).json({ message: err.message });
    }
};

// @desc    Delete direct income record (soft delete)
// @route   DELETE /api/finance/income/direct/:id
// @access  Private
exports.deleteDirectIncome = async (req, res) => {
    try {
        const tenant_id = req.user.tenant_id;
        const { id } = req.params;

        const income = await DirectIncome.findOne({ _id: id, tenant_id, is_active: true });
        if (!income) return res.status(404).json({ message: 'Income record not found' });

        income.is_active = false;
        await income.save();

        res.json({ message: 'Direct income deleted successfully' });
    } catch (err) {
        console.error('Error deleting direct income:', err);
        res.status(500).json({ message: err.message });
    }
};

// ==================== SUMMARY & DASHBOARD CONTROLLERS ====================

// @desc    Get income summary
// @route   GET /api/finance/income/summary
// @access  Private
exports.getIncomeSummary = async (req, res) => {
    try {
        const tenant_id = req.user.tenant_id;
        const { year, month } = req.query;

        const now          = new Date();
        const currentYear  = year  ? Number(year)  : now.getFullYear();
        const currentMonth = month ? Number(month) : now.getMonth() + 1;

        // --- Due-based: aggregate from DueBasedEntry ---
        const dueEntryQuery = {
            tenant_id: new mongoose.Types.ObjectId(tenant_id),
            is_active: true,
        };
        if (year)  dueEntryQuery.year  = currentYear;
        if (month) dueEntryQuery.month = currentMonth;

        const dueSummary = await DueBasedEntry.aggregate([
            { $match: dueEntryQuery },
            {
                $group: {
                    _id: null,
                    total_due:     { $sum: '$amount_due' },
                    total_paid:    { $sum: '$amount_paid' },
                    total_pending: { $sum: '$balance' },
                    paid_count:    { $sum: { $cond: [{ $eq: ['$status', 'paid'] },    1, 0] } },
                    partial_count: { $sum: { $cond: [{ $eq: ['$status', 'partial'] }, 1, 0] } },
                    unpaid_count:  { $sum: { $cond: [{ $eq: ['$status', 'unpaid'] },  1, 0] } },
                    overdue_count: { $sum: { $cond: [{ $eq: ['$status', 'overdue'] }, 1, 0] } },
                },
            },
        ]);

        // --- Direct income ---
        const directQuery = {
            tenant_id: new mongoose.Types.ObjectId(tenant_id),
            is_active: true,
        };
        if (year || month) {
            if (year && month) {
                directQuery.date = {
                    $gte: new Date(currentYear, currentMonth - 1, 1),
                    $lt:  new Date(currentYear, currentMonth, 1),
                };
            } else if (year) {
                directQuery.date = {
                    $gte: new Date(currentYear, 0, 1),
                    $lt:  new Date(currentYear + 1, 0, 1),
                };
            } else {
                directQuery.date = {
                    $gte: new Date(now.getFullYear(), currentMonth - 1, 1),
                    $lt:  new Date(now.getFullYear(), currentMonth, 1),
                };
            }
        }

        const directSummary = await DirectIncome.aggregate([
            { $match: directQuery },
            {
                $group: {
                    _id: null,
                    total_income: { $sum: '$amount' },
                    cash_income:  { $sum: { $cond: [{ $eq: ['$payment_method', 'cash'] }, '$amount', 0] } },
                    upi_income:   { $sum: { $cond: [{ $eq: ['$payment_method', 'upi']  }, '$amount', 0] } },
                    bank_income:  { $sum: { $cond: [{ $eq: ['$payment_method', 'bank'] }, '$amount', 0] } },
                },
            },
        ]);

        const categoryBreakdown = await DirectIncome.aggregate([
            { $match: directQuery },
            { $group: { _id: '$category', total: { $sum: '$amount' }, count: { $sum: 1 } } },
            { $sort: { total: -1 } },
        ]);

        const dueData    = dueSummary[0]    || { total_due: 0, total_paid: 0, total_pending: 0, paid_count: 0, partial_count: 0, unpaid_count: 0, overdue_count: 0 };
        const directData = directSummary[0] || { total_income: 0, cash_income: 0, upi_income: 0, bank_income: 0 };

        // This-month income
        const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const thisMonthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 1);

        const [thisMonthDue, thisMonthDirect] = await Promise.all([
            DueBasedEntry.aggregate([
                {
                    $match: {
                        tenant_id: new mongoose.Types.ObjectId(tenant_id),
                        is_active: true,
                        year:  now.getFullYear(),
                        month: now.getMonth() + 1,
                    },
                },
                { $group: { _id: null, total_paid: { $sum: '$amount_paid' } } },
            ]),
            DirectIncome.aggregate([
                {
                    $match: {
                        tenant_id: new mongoose.Types.ObjectId(tenant_id),
                        is_active: true,
                        date: { $gte: thisMonthStart, $lt: thisMonthEnd },
                    },
                },
                { $group: { _id: null, total: { $sum: '$amount' } } },
            ]),
        ]);

        const thisMonthIncome = (thisMonthDue[0]?.total_paid || 0) + (thisMonthDirect[0]?.total || 0);

        res.json({
            due_based:         dueData,
            direct:            directData,
            total_income:      dueData.total_paid + directData.total_income,
            this_month_income: thisMonthIncome,
            pending_amount:    dueData.total_pending,
            category_breakdown: categoryBreakdown,
        });
    } catch (err) {
        console.error('Error fetching income summary:', err);
        res.status(500).json({ message: err.message });
    }
};

// @desc    Update overdue status for due-based entries
// @route   POST /api/finance/income/update-overdue
// @access  Private
exports.updateOverdueStatus = async (req, res) => {
    try {
        const tenant_id = req.user.tenant_id;
        const result = await updateOverdueStatus(tenant_id);
        res.json({ message: 'Overdue status updated successfully', ...result });
    } catch (err) {
        console.error('Error updating overdue status:', err);
        res.status(500).json({ message: err.message });
    }
};
