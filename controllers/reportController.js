const IncomePayment = require('../models/IncomePayment');
const DirectIncome = require('../models/DirectIncome');
const HadiyaCollection = require('../models/HadiyaCollection');
const Expense = require('../models/Expense');
const DueExpenseEntry = require('../models/DueExpenseEntry');
const Varisankhya = require('../models/Varisankhya');
const mongoose = require('mongoose');

// Shared pipeline stages: join IncomePayment → DueBasedEntry → DueBasedIncome template
const incomeJoinStages = [
  {
    $lookup: {
      from: 'duebasedentries',
      localField: 'entry_id',
      foreignField: '_id',
      as: 'entry'
    }
  },
  { $unwind: { path: '$entry', preserveNullAndEmptyArrays: true } },
  {
    $lookup: {
      from: 'duebasedincomes',
      localField: 'entry.template_id',
      foreignField: '_id',
      as: 'template'
    }
  },
  { $unwind: { path: '$template', preserveNullAndEmptyArrays: true } }
];

// Shared pipeline stages: join DueExpenseEntry → DueExpense template
const dueExpenseJoinStages = [
  {
    $lookup: {
      from: 'dueexpenses',
      localField: 'template_id',
      foreignField: '_id',
      as: 'template'
    }
  },
  { $unwind: { path: '$template', preserveNullAndEmptyArrays: true } }
];

// Combined income across all three sources (Due Based payments + Direct Income + Hadiya
// Collection) for a tenant within a given date range — shared by Financial Statement,
// Trends and Export so their "Income" figure matches the Income tab exactly instead of
// only counting Due Based payments.
const getCombinedIncome = async (tid, dateMatch) => {
  const [dueTx, directTx, hadiyaTx] = await Promise.all([
    IncomePayment.aggregate([
      { $match: { tenant_id: tid, payment_date: dateMatch } },
      ...incomeJoinStages,
      { $project: { date: '$payment_date', category: '$template.category', source: '$template.source_name', amount: '$payment_amount', payment_method: '$payment_method' } }
    ]),
    DirectIncome.aggregate([
      { $match: { tenant_id: tid, is_active: true, date: dateMatch } },
      { $project: { date: '$date', category: '$category', source: '$source_name', amount: '$amount', payment_method: '$payment_method' } }
    ]),
    HadiyaCollection.aggregate([
      { $match: { tenant_id: tid, is_active: true, date: dateMatch } },
      {
        $project: {
          date: '$date',
          category: { $literal: 'Hadiya Collection' },
          source: {
            $cond: [
              { $eq: ['$contributor_type', 'house'] },
              'House Contribution',
              { $ifNull: ['$contributor_name', 'External Contribution'] }
            ]
          },
          amount: '$amount', payment_method: '$payment_method'
        }
      }
    ])
  ]);

  const transactions = [...dueTx, ...directTx, ...hadiyaTx].sort((a, b) => new Date(a.date) - new Date(b.date));
  const total = transactions.reduce((s, t) => s + t.amount, 0);
  return { total, transactions };
};

// Combined expense across both sources (Due Based Expense payments + Direct Expense) for
// a tenant within a given date range — same rationale as getCombinedIncome above.
const getCombinedExpense = async (tid, dateMatch) => {
  const [dueTx, directTx] = await Promise.all([
    // Due-expense entries have no separate payment ledger, so `updated_at` is used
    // as the closest available proxy for when a payment was actually recorded.
    DueExpenseEntry.aggregate([
      { $match: { tenant_id: tid, is_active: true, amount_paid: { $gt: 0 }, updated_at: dateMatch } },
      ...dueExpenseJoinStages,
      { $project: { date: '$updated_at', category: '$template.category', paid_to: '$template.paid_to', amount: '$amount_paid', payment_method: '$payment_method' } }
    ]),
    Expense.aggregate([
      { $match: { tenant_id: tid, is_active: true, date: dateMatch } },
      { $project: { date: '$date', category: '$category', paid_to: '$paid_to', amount: '$amount', payment_method: '$payment_method' } }
    ])
  ]);

  const transactions = [...dueTx, ...directTx].sort((a, b) => new Date(a.date) - new Date(b.date));
  const total = transactions.reduce((s, t) => s + t.amount, 0);
  return { total, transactions };
};

// Groups a transaction list into [{ _id: category, total }] for the category breakdown cards
const groupByCategory = (transactions) => {
  const totals = new Map();
  for (const t of transactions) {
    const cat = t.category || 'Uncategorized';
    totals.set(cat, (totals.get(cat) || 0) + t.amount);
  }
  return Array.from(totals, ([_id, total]) => ({ _id, total }));
};

// @desc    Get summary
// @route   GET /api/finance/reports/summary
// @access  Private
exports.getSummary = async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    const startOfMonth = new Date(currentYear, currentMonth - 1, 1);
    const endOfMonth = new Date(currentYear, currentMonth, 0, 23, 59, 59, 999);

    const [totalIncomeResult, totalExpenseResult, thisMonthIncomeResult, thisMonthExpenseResult, totalVarisankhyaResult] = await Promise.all([
      IncomePayment.aggregate([
        { $match: { tenant_id: new mongoose.Types.ObjectId(tenantId) } },
        { $group: { _id: null, total: { $sum: '$payment_amount' } } }
      ]),
      Expense.aggregate([
        { $match: { tenant_id: new mongoose.Types.ObjectId(tenantId) } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      IncomePayment.aggregate([
        { $match: { tenant_id: new mongoose.Types.ObjectId(tenantId), payment_date: { $gte: startOfMonth, $lte: endOfMonth } } },
        { $group: { _id: null, total: { $sum: '$payment_amount' } } }
      ]),
      Expense.aggregate([
        { $match: { tenant_id: new mongoose.Types.ObjectId(tenantId), date: { $gte: startOfMonth, $lte: endOfMonth } } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      Varisankhya.aggregate([
        { $match: { tenant_id: new mongoose.Types.ObjectId(tenantId) } },
        { $group: { _id: null, total: { $sum: '$amount_paid' } } }
      ])
    ]);

    const totalIncome      = totalIncomeResult[0]?.total      || 0;
    const totalExpense     = totalExpenseResult[0]?.total     || 0;
    const thisMonthIncome  = thisMonthIncomeResult[0]?.total  || 0;
    const thisMonthExpense = thisMonthExpenseResult[0]?.total || 0;
    const totalVarisankhya = totalVarisankhyaResult[0]?.total || 0;

    res.status(200).json({
      total_income:        totalIncome,
      total_expense:       totalExpense,
      balance:             totalIncome - totalExpense,
      this_month_income:   thisMonthIncome,
      this_month_expense:  thisMonthExpense,
      total_varisankhya:   totalVarisankhya
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get financial statement
// @route   GET /api/finance/reports/statement
// @access  Private
exports.getStatement = async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;
    const { month, year } = req.query;
    const tid = new mongoose.Types.ObjectId(tenantId);

    const targetMonth = parseInt(month) || new Date().getMonth() + 1;
    const targetYear  = parseInt(year)  || new Date().getFullYear();

    const startOfMonth = new Date(targetYear, targetMonth - 1, 1);
    const endOfMonth   = new Date(targetYear, targetMonth, 0, 23, 59, 59, 999);

    const [opening, closing] = await Promise.all([
      Promise.all([
        getCombinedIncome(tid, { $lt: startOfMonth }),
        getCombinedExpense(tid, { $lt: startOfMonth })
      ]),
      Promise.all([
        getCombinedIncome(tid, { $gte: startOfMonth, $lte: endOfMonth }),
        getCombinedExpense(tid, { $gte: startOfMonth, $lte: endOfMonth })
      ])
    ]);

    const [openingIncomeData, openingExpenseData] = opening;
    const [monthIncomeData, monthExpenseData] = closing;

    const openingIncome  = openingIncomeData.total;
    const openingExpense = openingExpenseData.total;
    const openingBalance = openingIncome - openingExpense;
    const monthIncome    = monthIncomeData.total;
    const monthExpense   = monthExpenseData.total;

    res.status(200).json({
      month:                targetMonth,
      year:                 targetYear,
      opening_balance:      openingBalance,
      opening_income:       openingIncome,
      opening_expense:      openingExpense,
      month_income:         monthIncome,
      month_expense:        monthExpense,
      closing_balance:      openingBalance + monthIncome - monthExpense,
      income_breakdown:     groupByCategory(monthIncomeData.transactions),
      expense_breakdown:    groupByCategory(monthExpenseData.transactions),
      income_transactions:  monthIncomeData.transactions,
      expense_transactions: monthExpenseData.transactions
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get trends
// @route   GET /api/finance/reports/trends
// @access  Private
exports.getTrends = async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;
    const tid = new mongoose.Types.ObjectId(tenantId);
    const { months = 12 } = req.query;
    const numberOfMonths = parseInt(months);
    const now = new Date();
    const currentYear = now.getFullYear();
    const trendsData = [];

    for (let i = 0; i < numberOfMonths; i++) {
      const date  = new Date(currentYear, i, 1);
      const month = date.getMonth() + 1;
      const year  = date.getFullYear();
      const startOfMonth = new Date(year, month - 1, 1);
      const endOfMonth   = new Date(year, month, 0, 23, 59, 59, 999);

      const [incomeData, expenseData] = await Promise.all([
        getCombinedIncome(tid, { $gte: startOfMonth, $lte: endOfMonth }),
        getCombinedExpense(tid, { $gte: startOfMonth, $lte: endOfMonth })
      ]);

      trendsData.push({
        month:   date.toLocaleString('default', { month: 'short' }),
        year,
        income:  incomeData.total,
        expense: expenseData.total,
        balance: incomeData.total - expenseData.total
      });
    }

    const growthData = trendsData.map((item, i) => {
      if (i === 0) return { ...item, income_growth: 0, expense_growth: 0 };
      const prev = trendsData[i - 1];
      return {
        ...item,
        income_growth:  prev.income  > 0 ? ((item.income  - prev.income)  / prev.income)  * 100 : 0,
        expense_growth: prev.expense > 0 ? ((item.expense - prev.expense) / prev.expense) * 100 : 0
      };
    });

    res.status(200).json({ data: trendsData, growth: growthData });
  } catch (error) {
    next(error);
  }
};

// @desc    Export report
// @route   GET /api/finance/reports/export
// @access  Private
exports.exportReport = async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;
    const tid = new mongoose.Types.ObjectId(tenantId);
    const { type, month, year } = req.query;

    if (type === 'monthly') {
      const targetMonth = parseInt(month) || new Date().getMonth() + 1;
      const targetYear  = parseInt(year)  || new Date().getFullYear();
      const startOfMonth = new Date(targetYear, targetMonth - 1, 1);
      const endOfMonth   = new Date(targetYear, targetMonth, 0, 23, 59, 59, 999);

      const [openingIncomeData, openingExpenseData, monthIncomeData, monthExpenseData] = await Promise.all([
        getCombinedIncome(tid, { $lt: startOfMonth }),
        getCombinedExpense(tid, { $lt: startOfMonth }),
        getCombinedIncome(tid, { $gte: startOfMonth, $lte: endOfMonth }),
        getCombinedExpense(tid, { $gte: startOfMonth, $lte: endOfMonth })
      ]);

      const openingBalance = openingIncomeData.total - openingExpenseData.total;
      const monthIncome    = monthIncomeData.total;
      const monthExpense   = monthExpenseData.total;

      res.status(200).json({
        type:                 'monthly',
        month:                targetMonth,
        year:                 targetYear,
        opening_balance:      openingBalance,
        income:               monthIncome,
        expense:              monthExpense,
        closing_balance:      openingBalance + monthIncome - monthExpense,
        income_transactions:  monthIncomeData.transactions,
        expense_transactions: monthExpenseData.transactions
      });

    } else if (type === 'annual') {
      const targetYear = parseInt(year) || new Date().getFullYear();
      const startOfYear = new Date(targetYear, 0, 1);
      const endOfYear   = new Date(targetYear, 11, 31, 23, 59, 59, 999);

      const [incomeData, expenseData] = await Promise.all([
        getCombinedIncome(tid, { $gte: startOfYear, $lte: endOfYear }),
        getCombinedExpense(tid, { $gte: startOfYear, $lte: endOfYear })
      ]);
      const incomeResult = incomeData.transactions;
      const expenseResult = expenseData.transactions;

      const monthlyData = Array.from({ length: 12 }, (_, i) => {
        const startOfMonth = new Date(targetYear, i, 1);
        const endOfMonth   = new Date(targetYear, i + 1, 0, 23, 59, 59, 999);
        const mIncome  = incomeResult.filter(item => { const d = new Date(item.date); return d >= startOfMonth && d <= endOfMonth; }).reduce((s, x) => s + x.amount, 0);
        const mExpense = expenseResult.filter(item => { const d = new Date(item.date); return d >= startOfMonth && d <= endOfMonth; }).reduce((s, x) => s + x.amount, 0);
        return { month: i + 1, month_name: new Date(targetYear, i).toLocaleString('default', { month: 'long' }), income: mIncome, expense: mExpense, balance: mIncome - mExpense };
      });

      const totalIncome  = incomeData.total;
      const totalExpense = expenseData.total;

      res.status(200).json({
        type:                 'annual',
        year:                 targetYear,
        total_income:         totalIncome,
        total_expense:        totalExpense,
        balance:              totalIncome - totalExpense,
        monthly_breakdown:    monthlyData,
        income_transactions:  incomeResult,
        expense_transactions: expenseResult
      });

    } else {
      res.status(400).json({ message: 'Invalid export type. Use "monthly" or "annual"' });
    }
  } catch (error) {
    next(error);
  }
};

// @desc    Get Income tab report — opening amount + due-based/direct/hadiya totals & transactions for a month
// @route   GET /api/finance/reports/income
// @access  Private
exports.getIncomeReport = async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;
    const { month, year, type } = req.query;
    const isAnnual = type === 'annual';

    const targetMonth = parseInt(month) || new Date().getMonth() + 1;
    const targetYear  = parseInt(year)  || new Date().getFullYear();

    const startOfPeriod = isAnnual
      ? new Date(targetYear, 0, 1)
      : new Date(targetYear, targetMonth - 1, 1);
    const endOfPeriod = isAnnual
      ? new Date(targetYear, 11, 31, 23, 59, 59, 999)
      : new Date(targetYear, targetMonth, 0, 23, 59, 59, 999);
    const tid = new mongoose.Types.ObjectId(tenantId);

    const [
      openingDueResult, openingDirectResult, openingHadiyaResult,
      dueTransactions, directTransactions, hadiyaTransactions
    ] = await Promise.all([
      IncomePayment.aggregate([
        { $match: { tenant_id: tid, payment_date: { $lt: startOfPeriod } } },
        { $group: { _id: null, total: { $sum: '$payment_amount' } } }
      ]),
      DirectIncome.aggregate([
        { $match: { tenant_id: tid, is_active: true, date: { $lt: startOfPeriod } } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      HadiyaCollection.aggregate([
        { $match: { tenant_id: tid, is_active: true, date: { $lt: startOfPeriod } } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      IncomePayment.aggregate([
        { $match: { tenant_id: tid, payment_date: { $gte: startOfPeriod, $lte: endOfPeriod } } },
        ...incomeJoinStages,
        {
          $project: {
            date:           '$payment_date',
            category:       '$template.category',
            source:         '$template.source_name',
            amount:         '$payment_amount',
            payment_method: '$payment_method'
          }
        },
        { $sort: { date: 1 } }
      ]),
      DirectIncome.aggregate([
        { $match: { tenant_id: tid, is_active: true, date: { $gte: startOfPeriod, $lte: endOfPeriod } } },
        {
          $project: {
            date: '$date', category: '$category', source: '$source_name',
            amount: '$amount', payment_method: '$payment_method'
          }
        },
        { $sort: { date: 1 } }
      ]),
      HadiyaCollection.aggregate([
        { $match: { tenant_id: tid, is_active: true, date: { $gte: startOfPeriod, $lte: endOfPeriod } } },
        {
          $project: {
            date: '$date',
            source: {
              $cond: [
                { $eq: ['$contributor_type', 'house'] },
                'House Contribution',
                { $ifNull: ['$contributor_name', 'External Contribution'] }
              ]
            },
            amount: '$amount', payment_method: '$payment_method'
          }
        },
        { $sort: { date: 1 } }
      ])
    ]);

    const dueTotal    = dueTransactions.reduce((s, i) => s + i.amount, 0);
    const directTotal = directTransactions.reduce((s, i) => s + i.amount, 0);
    const hadiyaTotal = hadiyaTransactions.reduce((s, i) => s + i.amount, 0);

    const openingAmount =
      (openingDueResult[0]?.total    || 0) +
      (openingDirectResult[0]?.total || 0) +
      (openingHadiyaResult[0]?.total || 0);

    res.status(200).json({
      type: isAnnual ? 'annual' : 'monthly',
      month: targetMonth,
      year: targetYear,
      opening_amount: openingAmount,
      total_income: dueTotal + directTotal + hadiyaTotal,
      due_based_income: { total: dueTotal, transactions: dueTransactions },
      direct_income: { total: directTotal, transactions: directTransactions },
      hadiya_income: { total: hadiyaTotal, transactions: hadiyaTransactions }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get Expense tab report — opening amount + due-based/direct totals & transactions for a month
// @route   GET /api/finance/reports/expense
// @access  Private
exports.getExpenseReport = async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;
    const { month, year, type } = req.query;
    const isAnnual = type === 'annual';

    const targetMonth = parseInt(month) || new Date().getMonth() + 1;
    const targetYear  = parseInt(year)  || new Date().getFullYear();

    const startOfPeriod = isAnnual
      ? new Date(targetYear, 0, 1)
      : new Date(targetYear, targetMonth - 1, 1);
    const endOfPeriod = isAnnual
      ? new Date(targetYear, 11, 31, 23, 59, 59, 999)
      : new Date(targetYear, targetMonth, 0, 23, 59, 59, 999);
    const tid = new mongoose.Types.ObjectId(tenantId);

    const [
      openingDueResult, openingDirectResult,
      dueTransactions, directTransactions
    ] = await Promise.all([
      // Due-expense entries have no separate payment ledger, so `updated_at` is used
      // as the closest available proxy for when a payment was actually recorded.
      DueExpenseEntry.aggregate([
        { $match: { tenant_id: tid, is_active: true, amount_paid: { $gt: 0 }, updated_at: { $lt: startOfPeriod } } },
        { $group: { _id: null, total: { $sum: '$amount_paid' } } }
      ]),
      Expense.aggregate([
        { $match: { tenant_id: tid, is_active: true, date: { $lt: startOfPeriod } } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      DueExpenseEntry.aggregate([
        { $match: { tenant_id: tid, is_active: true, amount_paid: { $gt: 0 }, updated_at: { $gte: startOfPeriod, $lte: endOfPeriod } } },
        ...dueExpenseJoinStages,
        {
          $project: {
            date:           '$updated_at',
            category:       '$template.category',
            paid_to:        '$template.paid_to',
            amount:         '$amount_paid',
            payment_method: '$payment_method'
          }
        },
        { $sort: { date: 1 } }
      ]),
      Expense.aggregate([
        { $match: { tenant_id: tid, is_active: true, date: { $gte: startOfPeriod, $lte: endOfPeriod } } },
        {
          $project: {
            date: '$date', category: '$category', paid_to: '$paid_to',
            amount: '$amount', payment_method: '$payment_method'
          }
        },
        { $sort: { date: 1 } }
      ])
    ]);

    const dueTotal    = dueTransactions.reduce((s, i) => s + i.amount, 0);
    const directTotal = directTransactions.reduce((s, i) => s + i.amount, 0);

    const openingAmount =
      (openingDueResult[0]?.total    || 0) +
      (openingDirectResult[0]?.total || 0);

    res.status(200).json({
      type: isAnnual ? 'annual' : 'monthly',
      month: targetMonth,
      year: targetYear,
      opening_amount: openingAmount,
      total_expense: dueTotal + directTotal,
      due_based_expense: { total: dueTotal, transactions: dueTransactions },
      direct_expense: { total: directTotal, transactions: directTransactions }
    });
  } catch (error) {
    next(error);
  }
};
