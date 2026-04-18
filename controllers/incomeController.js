const DueBasedIncome = require('../models/DueBasedIncome');
const DirectIncome = require('../models/DirectIncome');
const IncomePayment = require('../models/IncomePayment');
const { generateDueIncomeCode, generateDirectIncomeCode, generateReceiptNo, updateOverdueStatus } = require('../utils/incomeUtils');

// ==================== DUE BASED INCOME CONTROLLERS ====================

// @desc    Create due-based income record
// @route   POST /api/finance/income/due/create
// @access  Private
exports.createDueIncome = async (req, res, next) => {
    try {
        const tenant_id = req.user.tenant_id;
        const created_by = req.user.id;

        const { category, source_name, month, year, amount_due, due_date, notes } = req.body;

        if (!category || !source_name || !month || !year || !amount_due || !due_date) {
            return res.status(400).json({ message: 'Missing required fields' });
        }

        if (amount_due <= 0) {
            return res.status(400).json({ message: 'Amount due must be positive' });
        }

        const income_code = await generateDueIncomeCode(tenant_id);

        // Calculate balance and status manually
        const amount_paid = 0;
        const balance = amount_due - amount_paid;
        
        let status = 'unpaid';
        if (balance <= 0) {
            status = 'paid';
        } else if (amount_paid > 0) {
            status = 'partial';
        }
        
        // Check for overdue status
        if (status !== 'paid' && new Date(due_date) < new Date()) {
            status = 'overdue';
        }

        const income = new DueBasedIncome({
            tenant_id,
            income_code,
            category,
            source_name,
            month,
            year,
            amount_due,
            amount_paid,
            balance,
            due_date,
            status,
            notes: notes || '',
            created_by
        });

        await income.save();

        res.status(201).json({ message: 'Due-based income created successfully', income });
    } catch (err) {
        console.error('Error creating due income:', err);
        res.status(500).json({ message: err.message });
    }
};

// @desc    Get all due-based income records
// @route   GET /api/finance/income/due
// @access  Private
exports.getDueIncome = async (req, res, next) => {
    try {
        const { page = 1, limit = 10, search = '', category, status, month, year } = req.query;
        const tenant_id = req.user.tenant_id;
        const skip = (Number(page) - 1) * Number(limit);

        const query = { tenant_id, is_active: true };

        if (category) query.category = category;
        if (status) query.status = status;
        if (month) query.month = Number(month);
        if (year) query.year = Number(year);

        if (search) {
            query.$or = [
                { source_name: { $regex: search, $options: 'i' } },
                { income_code: { $regex: search, $options: 'i' } }
            ];
        }

        const incomes = await DueBasedIncome.find(query)
            .sort({ created_at: -1 })
            .skip(skip)
            .limit(Number(limit));

        const total = await DueBasedIncome.countDocuments(query);

        res.json({ incomes, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
    } catch (err) {
        console.error('Error fetching due income:', err);
        res.status(500).json({ message: err.message });
    }
};

// @desc    Update due-based income record
// @route   PUT /api/finance/income/due/:id
// @access  Private
exports.updateDueIncome = async (req, res, next) => {
    try {
        const tenant_id = req.user.tenant_id;
        const { id } = req.params;
        const { category, source_name, month, year, amount_due, due_date, notes } = req.body;

        const income = await DueBasedIncome.findOne({ _id: id, tenant_id, is_active: true });
        if (!income) {
            return res.status(404).json({ message: 'Income record not found' });
        }

        if (amount_due && income.amount_paid > 0) {
            return res.status(400).json({ message: 'Cannot update amount due for records with payments' });
        }

        if (category) income.category = category;
        if (source_name) income.source_name = source_name;
        if (month) income.month = month;
        if (year) income.year = year;
        if (amount_due && income.amount_paid === 0) {
            income.amount_due = amount_due;
            income.balance = amount_due;
        }
        if (due_date) income.due_date = due_date;
        if (notes !== undefined) income.notes = notes;

        await income.save();

        res.json({ message: 'Due-based income updated successfully', income });
    } catch (err) {
        console.error('Error updating due income:', err);
        res.status(500).json({ message: err.message });
    }
};

// @desc    Delete due-based income record (soft delete)
// @route   DELETE /api/finance/income/due/:id
// @access  Private
exports.deleteDueIncome = async (req, res, next) => {
    try {
        const tenant_id = req.user.tenant_id;
        const { id } = req.params;

        const income = await DueBasedIncome.findOne({ _id: id, tenant_id, is_active: true });
        if (!income) {
            return res.status(404).json({ message: 'Income record not found' });
        }

        if (income.amount_paid > 0) {
            return res.status(400).json({ message: 'Cannot delete record with payments' });
        }

        income.is_active = false;
        await income.save();

        res.json({ message: 'Due-based income deleted successfully' });
    } catch (err) {
        console.error('Error deleting due income:', err);
        res.status(500).json({ message: err.message });
    }
};

// @desc    Mark payment for due-based income
// @route   PUT /api/finance/income/due/pay/:id
// @access  Private
exports.markDuePayment = async (req, res, next) => {
    try {
        const tenant_id = req.user.tenant_id;
        const { id } = req.params;
        const received_by = req.user.id;

        const { payment_amount, payment_method, reference_no, notes } = req.body;

        if (!payment_amount || payment_amount <= 0) {
            return res.status(400).json({ message: 'Payment amount must be positive' });
        }

        const income = await DueBasedIncome.findOne({ _id: id, tenant_id, is_active: true });
        if (!income) {
            return res.status(404).json({ message: 'Income record not found' });
        }

        const previousPaid = income.amount_paid || 0;
        const newTotalPaid = previousPaid + Number(payment_amount);

        if (newTotalPaid > income.amount_due) {
            return res.status(400).json({
                message: 'Payment exceeds due amount',
                details: {
                    amount_due: income.amount_due,
                    previous_paid: previousPaid,
                    new_payment: Number(payment_amount),
                    total_after_payment: newTotalPaid,
                    excess_amount: newTotalPaid - income.amount_due
                }
            });
        }

        const receipt_no = await generateReceiptNo(tenant_id);

        const payment = new IncomePayment({
            tenant_id,
            due_income_id: income._id,
            payment_amount: Number(payment_amount),
            payment_method: payment_method || 'cash',
            payment_date: new Date(),
            reference_no: reference_no || '',
            notes: notes || '',
            receipt_no,
            received_by
        });

        await payment.save();

        income.amount_paid = newTotalPaid;
        income.payment_method = payment_method || 'cash';
        income.receipt_no = receipt_no;
        await income.save();

        res.json({
            message: 'Payment recorded successfully',
            income,
            payment,
            payment_details: {
                this_payment: Number(payment_amount),
                previous_paid: previousPaid,
                total_paid: newTotalPaid,
                amount_due: income.amount_due,
                remaining_amount: income.balance,
                status: income.status
            }
        });
    } catch (err) {
        console.error('Error marking payment:', err);
        res.status(500).json({ message: err.message });
    }
};

// @desc    Get payment history for due-based income
// @route   GET /api/finance/income/due/history/:id
// @access  Private
exports.getDuePaymentHistory = async (req, res, next) => {
    try {
        const tenant_id = req.user.tenant_id;
        const { id } = req.params;

        const income = await DueBasedIncome.findOne({ _id: id, tenant_id, is_active: true });
        if (!income) {
            return res.status(404).json({ message: 'Income record not found' });
        }

        const payments = await IncomePayment.find({ tenant_id, due_income_id: id })
            .populate('received_by', 'name')
            .sort({ payment_date: -1 });

        res.json({
            income_id: id,
            income_code: income.income_code,
            payments,
            total_payments: payments.length,
            total_paid: payments.reduce((sum, p) => sum + p.payment_amount, 0)
        });
    } catch (err) {
        console.error('Error fetching payment history:', err);
        res.status(500).json({ message: err.message });
    }
};

// ==================== DIRECT INCOME CONTROLLERS ====================

// @desc    Create direct income record
// @route   POST /api/finance/income/direct/create
// @access  Private
exports.createDirectIncome = async (req, res, next) => {
    try {
        const tenant_id = req.user.tenant_id;
        const created_by = req.user.id;

        const { category, source_name, amount, date, payment_method, reference_no, description } = req.body;

        if (!category || !source_name || !amount) {
            return res.status(400).json({ message: 'Missing required fields' });
        }

        if (amount <= 0) {
            return res.status(400).json({ message: 'Amount must be positive' });
        }

        const income_code = await generateDirectIncomeCode(tenant_id);
        const receipt_no = await generateReceiptNo(tenant_id);

        const income = new DirectIncome({
            tenant_id,
            income_code,
            category,
            source_name,
            amount: Number(amount),
            date: date ? new Date(date) : new Date(),
            payment_method: payment_method || 'cash',
            reference_no: reference_no || '',
            description: description || '',
            receipt_no,
            created_by
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
exports.getDirectIncome = async (req, res, next) => {
    try {
        const { page = 1, limit = 10, search = '', category, payment_method, month, year } = req.query;
        const tenant_id = req.user.tenant_id;
        const skip = (Number(page) - 1) * Number(limit);

        const query = { tenant_id, is_active: true };

        if (category) query.category = category;
        if (payment_method) query.payment_method = payment_method;

        if (month || year) {
            const dateQuery = {};
            if (year) {
                const startDate = new Date(year, 0, 1);
                const endDate = new Date(parseInt(year) + 1, 0, 1);
                dateQuery.$gte = startDate;
                dateQuery.$lt = endDate;
            }
            if (month) {
                const yearFilter = year || new Date().getFullYear();
                const startDate = new Date(yearFilter, month - 1, 1);
                const endDate = new Date(yearFilter, month, 1);
                dateQuery.$gte = startDate;
                dateQuery.$lt = endDate;
            }
            query.date = dateQuery;
        }

        if (search) {
            query.$or = [
                { source_name: { $regex: search, $options: 'i' } },
                { income_code: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } }
            ];
        }

        const incomes = await DirectIncome.find(query)
            .sort({ date: -1 })
            .skip(skip)
            .limit(Number(limit));

        const total = await DirectIncome.countDocuments(query);

        res.json({ incomes, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
    } catch (err) {
        console.error('Error fetching direct income:', err);
        res.status(500).json({ message: err.message });
    }
};

// @desc    Update direct income record
// @route   PUT /api/finance/income/direct/:id
// @access  Private
exports.updateDirectIncome = async (req, res, next) => {
    try {
        const tenant_id = req.user.tenant_id;
        const { id } = req.params;
        const { category, source_name, amount, date, payment_method, reference_no, description } = req.body;

        const income = await DirectIncome.findOne({ _id: id, tenant_id, is_active: true });
        if (!income) {
            return res.status(404).json({ message: 'Income record not found' });
        }

        if (category) income.category = category;
        if (source_name) income.source_name = source_name;
        if (amount) income.amount = Number(amount);
        if (date) income.date = new Date(date);
        if (payment_method) income.payment_method = payment_method;
        if (reference_no !== undefined) income.reference_no = reference_no;
        if (description !== undefined) income.description = description;

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
exports.deleteDirectIncome = async (req, res, next) => {
    try {
        const tenant_id = req.user.tenant_id;
        const { id } = req.params;

        const income = await DirectIncome.findOne({ _id: id, tenant_id, is_active: true });
        if (!income) {
            return res.status(404).json({ message: 'Income record not found' });
        }

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
exports.getIncomeSummary = async (req, res, next) => {
    try {
        const tenant_id = req.user.tenant_id;
        const { year, month } = req.query;

        const now = new Date();
        const currentYear = year ? Number(year) : now.getFullYear();
        const currentMonth = month ? Number(month) : now.getMonth() + 1;

        // Due-based income summary
        const dueQuery = { tenant_id, is_active: true };
        if (year) dueQuery.year = currentYear;
        if (month) dueQuery.month = currentMonth;

        const dueSummary = await DueBasedIncome.aggregate([
            { $match: dueQuery },
            {
                $group: {
                    _id: null,
                    total_due: { $sum: '$amount_due' },
                    total_paid: { $sum: '$amount_paid' },
                    total_pending: { $sum: '$balance' },
                    paid_count: { $sum: { $cond: [{ $eq: ['$status', 'paid'] }, 1, 0] } },
                    partial_count: { $sum: { $cond: [{ $eq: ['$status', 'partial'] }, 1, 0] } },
                    unpaid_count: { $sum: { $cond: [{ $eq: ['$status', 'unpaid'] }, 1, 0] } },
                    overdue_count: { $sum: { $cond: [{ $eq: ['$status', 'overdue'] }, 1, 0] } }
                }
            }
        ]);

        // Direct income summary
        const directQuery = { tenant_id, is_active: true };
        if (year || month) {
            const dateQuery = {};
            if (year) {
                const startDate = new Date(currentYear, 0, 1);
                const endDate = new Date(currentYear + 1, 0, 1);
                dateQuery.$gte = startDate;
                dateQuery.$lt = endDate;
            }
            if (month) {
                const startDate = new Date(currentYear, currentMonth - 1, 1);
                const endDate = new Date(currentYear, currentMonth, 1);
                dateQuery.$gte = startDate;
                dateQuery.$lt = endDate;
            }
            directQuery.date = dateQuery;
        }

        const directSummary = await DirectIncome.aggregate([
            { $match: directQuery },
            {
                $group: {
                    _id: null,
                    total_income: { $sum: '$amount' },
                    cash_income: { $sum: { $cond: [{ $eq: ['$payment_method', 'cash'] }, '$amount', 0] } },
                    upi_income: { $sum: { $cond: [{ $eq: ['$payment_method', 'upi'] }, '$amount', 0] } },
                    bank_income: { $sum: { $cond: [{ $eq: ['$payment_method', 'bank'] }, '$amount', 0] } }
                }
            }
        ]);

        // Category breakdown for direct income
        const categoryBreakdown = await DirectIncome.aggregate([
            { $match: directQuery },
            {
                $group: {
                    _id: '$category',
                    total: { $sum: '$amount' },
                    count: { $sum: 1 }
                }
            },
            { $sort: { total: -1 } }
        ]);

        const dueData = dueSummary[0] || {
            total_due: 0, total_paid: 0, total_pending: 0,
            paid_count: 0, partial_count: 0, unpaid_count: 0, overdue_count: 0
        };

        const directData = directSummary[0] || {
            total_income: 0, cash_income: 0, upi_income: 0, bank_income: 0
        };

        // Calculate this month's income
        const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const thisMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

        const thisMonthDue = await DueBasedIncome.aggregate([
            {
                $match: {
                    tenant_id,
                    is_active: true,
                    year: now.getFullYear(),
                    month: now.getMonth() + 1
                }
            },
            { $group: { _id: null, total_paid: { $sum: '$amount_paid' } } }
        ]);

        const thisMonthDirect = await DirectIncome.aggregate([
            {
                $match: {
                    tenant_id,
                    is_active: true,
                    date: { $gte: thisMonthStart, $lt: thisMonthEnd }
                }
            },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);

        const thisMonthIncome = (thisMonthDue[0]?.total_paid || 0) + (thisMonthDirect[0]?.total || 0);

        res.json({
            due_based: dueData,
            direct: directData,
            total_income: dueData.total_paid + directData.total_income,
            this_month_income: thisMonthIncome,
            pending_amount: dueData.total_pending,
            category_breakdown: categoryBreakdown
        });
    } catch (err) {
        console.error('Error fetching income summary:', err);
        res.status(500).json({ message: err.message });
    }
};

// @desc    Update overdue status
// @route   POST /api/finance/income/update-overdue
// @access  Private
exports.updateOverdueStatus = async (req, res, next) => {
    try {
        const tenant_id = req.user.tenant_id;
        const result = await updateOverdueStatus(tenant_id);
        res.json({ message: 'Overdue status updated successfully', ...result });
    } catch (err) {
        console.error('Error updating overdue status:', err);
        res.status(500).json({ message: err.message });
    }
};
