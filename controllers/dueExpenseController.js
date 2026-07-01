const mongoose = require('mongoose');
const DueExpense = require('../models/DueExpense');
const DueExpenseEntry = require('../models/DueExpenseEntry');
const Counter = require('../models/Counter');
const generateSequence = require('../utils/generateSequence');

// ==================== HELPERS ====================

const generateDueExpenseCode = async (tenant_id) => {
    const existing = await Counter.findOne({ tenant_id, type: 'due_expense' });
    if (!existing) {
        const last = await DueExpense.findOne({ tenant_id }).sort({ expense_code: -1 }).select('expense_code');
        if (last?.expense_code) {
            const n = parseInt(last.expense_code.split('-')[1]);
            if (!isNaN(n) && n > 0) {
                try { await Counter.create({ tenant_id, type: 'due_expense', seq: n }); } catch (e) {}
            }
        }
    }
    return generateSequence(tenant_id, 'due_expense', 'DEXP');
};

const generateExpenseReceiptNo = async (tenant_id) => {
    return generateSequence(tenant_id, 'expense_receipt', 'ERCP');
};

/**
 * Auto-generate monthly entries from template.start to (upToMonth, upToYear).
 * Idempotent — skips already-existing entries.
 */
const generateEntriesUpTo = async (template, upToMonth, upToYear) => {
    const existing = await DueExpenseEntry.find({
        tenant_id: template.tenant_id,
        template_id: template._id,
    }).select('month year');

    const existingSet = new Set(existing.map(e => `${e.year}-${e.month}`));
    const now = new Date();
    const toCreate = [];
    let m = template.start_month;
    let y = template.start_year;

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
                amount: template.amount,
                amount_paid: 0,
                balance: template.amount,
                status,
                due_date: dueDate,
            });
        }
        m++;
        if (m > 12) { m = 1; y++; }
    }

    if (toCreate.length > 0) {
        await DueExpenseEntry.insertMany(toCreate, { ordered: false });
    }
};

// ==================== CONTROLLERS ====================

// @desc    Create due-expense subscription template
// @route   POST /api/finance/due-expense/create
exports.createDueExpense = async (req, res) => {
    try {
        const tenant_id = req.user.tenant_id;
        const created_by = req.user.id;
        const { category, paid_to, whatsapp, start_month, start_year, amount, notes } = req.body;

        if (!category || !paid_to || !start_month || !start_year || !amount) {
            return res.status(400).json({ message: 'Missing required fields' });
        }
        if (Number(amount) <= 0) {
            return res.status(400).json({ message: 'Amount must be positive' });
        }

        const expense_code = await generateDueExpenseCode(tenant_id);

        const template = new DueExpense({
            tenant_id,
            expense_code,
            category,
            paid_to,
            whatsapp: whatsapp || '',
            amount: Number(amount),
            start_month: Number(start_month),
            start_year: Number(start_year),
            notes: notes || '',
            created_by,
        });

        await template.save();

        const now = new Date();
        const currentMonth = now.getMonth() + 1;
        const currentYear  = now.getFullYear();
        const startM = Number(start_month);
        const startY = Number(start_year);

        if (startY < currentYear || (startY === currentYear && startM <= currentMonth)) {
            await generateEntriesUpTo(template, currentMonth, currentYear);
        }

        res.status(201).json({ message: 'Due expense subscription created', expense: template });
    } catch (err) {
        console.error('Error creating due expense:', err);
        res.status(500).json({ message: err.message });
    }
};

// @desc    Get due-expense subscriptions with their entry for the selected month/year
// @route   GET /api/finance/due-expense
exports.getDueExpenses = async (req, res) => {
    try {
        const { page = 1, limit = 10, search = '', category, status, month, year } = req.query;
        const tenant_id = req.user.tenant_id;

        const now = new Date();
        const viewMonth    = month ? Number(month) : now.getMonth() + 1;
        const viewYear     = year  ? Number(year)  : now.getFullYear();
        const currentMonth = now.getMonth() + 1;
        const currentYear  = now.getFullYear();

        const templateQuery = { tenant_id, is_active: true };
        if (category) templateQuery.category = category;
        if (search) {
            templateQuery.$or = [
                { paid_to:      { $regex: search, $options: 'i' } },
                { expense_code: { $regex: search, $options: 'i' } },
            ];
        }

        const templates = await DueExpense.find(templateQuery).sort({ created_at: -1 });

        for (const tpl of templates) {
            const startBeforeCurrent =
                tpl.start_year < currentYear ||
                (tpl.start_year === currentYear && tpl.start_month <= currentMonth);
            if (startBeforeCurrent) {
                await generateEntriesUpTo(tpl, currentMonth, currentYear);
            }
        }

        const templateIds = templates.map(t => t._id);
        const entries = await DueExpenseEntry.find({
            tenant_id,
            template_id: { $in: templateIds },
            month: viewMonth,
            year: viewYear,
        });

        const entryMap = {};
        entries.forEach(e => { entryMap[e.template_id.toString()] = e; });

        let merged = templates.map(t => ({
            ...t.toObject(),
            entry: entryMap[t._id.toString()] || null,
        }));

        if (status) {
            merged = merged.filter(t => (t.entry?.status ?? 'upcoming') === status);
        }

        const total     = merged.length;
        const skip      = (Number(page) - 1) * Number(limit);
        const paginated = merged.slice(skip, skip + Number(limit));

        res.json({
            expenses: paginated,
            total,
            page: Number(page),
            pages: Math.ceil(total / Number(limit)),
            view_month: viewMonth,
            view_year:  viewYear,
        });
    } catch (err) {
        console.error('Error fetching due expenses:', err);
        res.status(500).json({ message: err.message });
    }
};

// @desc    Update due-expense template
// @route   PUT /api/finance/due-expense/:id
exports.updateDueExpense = async (req, res) => {
    try {
        const tenant_id = req.user.tenant_id;
        const { id } = req.params;
        const { category, paid_to, whatsapp, amount, notes } = req.body;

        const existing = await DueExpense.findOne({ _id: id, tenant_id, is_active: true });
        if (!existing) return res.status(404).json({ message: 'Expense record not found' });

        const $set = { updated_by: req.user.id };
        if (category !== undefined) $set.category = category;
        if (paid_to  !== undefined) $set.paid_to  = paid_to;
        if (whatsapp !== undefined) $set.whatsapp  = whatsapp;
        if (notes    !== undefined) $set.notes     = notes;
        if (amount   !== undefined) $set.amount    = Number(amount);

        await DueExpense.updateOne({ _id: id }, { $set });

        if (amount !== undefined) {
            const now = new Date();
            await DueExpenseEntry.updateMany(
                {
                    tenant_id,
                    template_id: id,
                    status: { $in: ['unpaid', 'overdue'] },
                    $or: [
                        { year: { $gt: now.getFullYear() } },
                        { year: now.getFullYear(), month: { $gte: now.getMonth() + 1 } },
                    ],
                },
                { $set: { amount: Number(amount), balance: Number(amount) } }
            );
        }

        const updated = await DueExpense.findById(id);
        res.json({ message: 'Due expense updated successfully', expense: updated });
    } catch (err) {
        console.error('Error updating due expense:', err);
        res.status(500).json({ message: err.message });
    }
};

// @desc    Deactivate due-expense template (soft delete)
// @route   DELETE /api/finance/due-expense/:id
exports.deleteDueExpense = async (req, res) => {
    try {
        const tenant_id = req.user.tenant_id;
        const { id } = req.params;

        const result = await DueExpense.updateOne(
            { _id: id, tenant_id, is_active: true },
            { $set: { is_active: false } }
        );
        if (result.matchedCount === 0) return res.status(404).json({ message: 'Expense record not found' });

        await DueExpenseEntry.updateMany(
            { template_id: id, tenant_id },
            { $set: { is_active: false } }
        );

        res.json({ message: 'Due expense subscription deactivated' });
    } catch (err) {
        console.error('Error deleting due expense:', err);
        res.status(500).json({ message: err.message });
    }
};

// @desc    Mark payment against a monthly entry
// @route   PUT /api/finance/due-expense/pay/:id  (id = entry._id)
exports.markDueExpensePayment = async (req, res) => {
    try {
        const tenant_id  = req.user.tenant_id;
        const { id } = req.params;
        const { payment_amount, payment_method, reference_no, notes } = req.body;

        if (!payment_amount || Number(payment_amount) <= 0) {
            return res.status(400).json({ message: 'Payment amount must be positive' });
        }

        const entry = await DueExpenseEntry.findOne({ _id: id, tenant_id, is_active: true });
        if (!entry) return res.status(404).json({ message: 'Entry not found' });

        const newTotalPaid = (entry.amount_paid || 0) + Number(payment_amount);
        if (newTotalPaid > entry.amount) {
            return res.status(400).json({
                message: 'Payment exceeds due amount',
                details: {
                    amount:         entry.amount,
                    previous_paid:  entry.amount_paid,
                    new_payment:    Number(payment_amount),
                    excess:         newTotalPaid - entry.amount,
                },
            });
        }

        const receipt_no = await generateExpenseReceiptNo(tenant_id);

        const newBalance = entry.amount - newTotalPaid;
        let newStatus = newBalance <= 0 ? 'paid' : newTotalPaid > 0 ? 'partial' : 'unpaid';
        if (newStatus !== 'paid' && entry.due_date && entry.due_date < new Date()) {
            newStatus = 'overdue';
        }

        await DueExpenseEntry.updateOne(
            { _id: id },
            {
                $set: {
                    amount_paid:    newTotalPaid,
                    balance:        newBalance,
                    status:         newStatus,
                    payment_method: payment_method || 'cash',
                    receipt_no,
                },
            }
        );

        const updatedEntry = await DueExpenseEntry.findById(id);

        res.json({
            message: 'Payment recorded successfully',
            entry: updatedEntry,
            payment_details: {
                this_payment:  Number(payment_amount),
                previous_paid: entry.amount_paid,
                total_paid:    newTotalPaid,
                amount:        entry.amount,
                remaining:     newBalance,
                status:        newStatus,
                receipt_no,
            },
        });
    } catch (err) {
        console.error('Error marking due expense payment:', err);
        res.status(500).json({ message: err.message });
    }
};

// @desc    Get all monthly entries for a template (subscription history across months)
// @route   GET /api/finance/due-expense/:id/entries
exports.getDueExpenseTemplateEntries = async (req, res) => {
    try {
        const tenant_id = req.user.tenant_id;
        const { id } = req.params;

        const template = await DueExpense.findOne({ _id: id, tenant_id });
        if (!template) return res.status(404).json({ message: 'Template not found' });

        const entries = await DueExpenseEntry.find({ tenant_id, template_id: id })
            .sort({ year: -1, month: -1 });

        res.json({ template, entries });
    } catch (err) {
        console.error('Error fetching template entries:', err);
        res.status(500).json({ message: err.message });
    }
};

// @desc    Get summary for due expenses
// @route   GET /api/finance/due-expense/summary
exports.getDueExpenseSummary = async (req, res) => {
    try {
        const tenant_id = req.user.tenant_id;
        const { month, year } = req.query;
        const now          = new Date();
        const currentYear  = year  ? Number(year)  : now.getFullYear();
        const currentMonth = month ? Number(month) : now.getMonth() + 1;

        const matchQuery = {
            tenant_id: new mongoose.Types.ObjectId(tenant_id),
            is_active:  true,
        };
        if (year)  matchQuery.year  = currentYear;
        if (month) matchQuery.month = currentMonth;

        const summary = await DueExpenseEntry.aggregate([
            { $match: matchQuery },
            {
                $group: {
                    _id:           null,
                    total_due:     { $sum: '$amount' },
                    total_paid:    { $sum: '$amount_paid' },
                    total_pending: { $sum: '$balance' },
                    paid_count:    { $sum: { $cond: [{ $eq: ['$status', 'paid'] },    1, 0] } },
                    partial_count: { $sum: { $cond: [{ $eq: ['$status', 'partial'] }, 1, 0] } },
                    unpaid_count:  { $sum: { $cond: [{ $eq: ['$status', 'unpaid'] },  1, 0] } },
                    overdue_count: { $sum: { $cond: [{ $eq: ['$status', 'overdue'] }, 1, 0] } },
                },
            },
        ]);

        const data = summary[0] || {
            total_due: 0, total_paid: 0, total_pending: 0,
            paid_count: 0, partial_count: 0, unpaid_count: 0, overdue_count: 0,
        };

        res.json(data);
    } catch (err) {
        console.error('Error fetching due expense summary:', err);
        res.status(500).json({ message: err.message });
    }
};

// @desc    Update overdue status for due expense entries
exports.updateDueExpenseOverdueStatus = async () => {
    const today = new Date();
    const result = await DueExpenseEntry.updateMany(
        { status: { $in: ['unpaid', 'partial'] }, due_date: { $lt: today }, is_active: true },
        { $set: { status: 'overdue' } }
    );
    return { updated_count: result.modifiedCount };
};
