const IncomePayment = require('../models/IncomePayment');
const Expense = require('../models/Expense');
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

// @desc    Get summary
// @route   GET /api/finance/reports/summary
// @access  Private
exports.getSummary = async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    const startOfMonth = new Date(Date.UTC(currentYear, currentMonth - 1, 1));
    const endOfMonth = new Date(Date.UTC(currentYear, currentMonth, 0, 23, 59, 59, 999));

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

    const targetMonth = parseInt(month) || new Date().getMonth() + 1;
    const targetYear  = parseInt(year)  || new Date().getFullYear();

    const startOfMonth = new Date(Date.UTC(targetYear, targetMonth - 1, 1));
    const endOfMonth   = new Date(Date.UTC(targetYear, targetMonth, 0, 23, 59, 59, 999));

    const [openingIncomeResult, openingExpenseResult, incomeResult, expenseResult, incomeCategoryBreakdown, expenseCategoryBreakdown] = await Promise.all([
      IncomePayment.aggregate([
        { $match: { tenant_id: new mongoose.Types.ObjectId(tenantId), payment_date: { $lt: startOfMonth } } },
        { $group: { _id: null, total: { $sum: '$payment_amount' } } }
      ]),
      Expense.aggregate([
        { $match: { tenant_id: new mongoose.Types.ObjectId(tenantId), date: { $lt: startOfMonth } } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      IncomePayment.aggregate([
        { $match: { tenant_id: new mongoose.Types.ObjectId(tenantId), payment_date: { $gte: startOfMonth, $lte: endOfMonth } } },
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
      Expense.aggregate([
        { $match: { tenant_id: new mongoose.Types.ObjectId(tenantId), date: { $gte: startOfMonth, $lte: endOfMonth } } },
        { $project: { date: '$date', category: '$category', paid_to: '$paid_to', amount: '$amount', payment_method: '$payment_method' } },
        { $sort: { date: 1 } }
      ]),
      IncomePayment.aggregate([
        { $match: { tenant_id: new mongoose.Types.ObjectId(tenantId), payment_date: { $gte: startOfMonth, $lte: endOfMonth } } },
        ...incomeJoinStages,
        { $group: { _id: '$template.category', total: { $sum: '$payment_amount' } } }
      ]),
      Expense.aggregate([
        { $match: { tenant_id: new mongoose.Types.ObjectId(tenantId), date: { $gte: startOfMonth, $lte: endOfMonth } } },
        { $group: { _id: '$category', total: { $sum: '$amount' } } }
      ])
    ]);

    const openingIncome  = openingIncomeResult[0]?.total  || 0;
    const openingExpense = openingExpenseResult[0]?.total || 0;
    const openingBalance = openingIncome - openingExpense;
    const monthIncome    = incomeResult.reduce((s, i) => s + i.amount, 0);
    const monthExpense   = expenseResult.reduce((s, i) => s + i.amount, 0);

    res.status(200).json({
      month:                targetMonth,
      year:                 targetYear,
      opening_balance:      openingBalance,
      opening_income:       openingIncome,
      opening_expense:      openingExpense,
      month_income:         monthIncome,
      month_expense:        monthExpense,
      closing_balance:      openingBalance + monthIncome - monthExpense,
      income_breakdown:     incomeCategoryBreakdown,
      expense_breakdown:    expenseCategoryBreakdown,
      income_transactions:  incomeResult,
      expense_transactions: expenseResult
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
    const { months = 12 } = req.query;
    const numberOfMonths = parseInt(months);
    const now = new Date();
    const currentYear = now.getFullYear();
    const trendsData = [];

    for (let i = 0; i < numberOfMonths; i++) {
      const date  = new Date(currentYear, i, 1);
      const month = date.getMonth() + 1;
      const year  = date.getFullYear();
      const startOfMonth = new Date(Date.UTC(year, month - 1, 1));
      const endOfMonth   = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

      const [incomeResult, expenseResult] = await Promise.all([
        IncomePayment.aggregate([
          { $match: { tenant_id: new mongoose.Types.ObjectId(tenantId), payment_date: { $gte: startOfMonth, $lte: endOfMonth } } },
          { $group: { _id: null, total: { $sum: '$payment_amount' } } }
        ]),
        Expense.aggregate([
          { $match: { tenant_id: new mongoose.Types.ObjectId(tenantId), date: { $gte: startOfMonth, $lte: endOfMonth } } },
          { $group: { _id: null, total: { $sum: '$amount' } } }
        ])
      ]);

      trendsData.push({
        month:   date.toLocaleString('default', { month: 'short' }),
        year,
        income:  incomeResult[0]?.total  || 0,
        expense: expenseResult[0]?.total || 0,
        balance: (incomeResult[0]?.total || 0) - (expenseResult[0]?.total || 0)
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
    const { type, month, year } = req.query;

    if (type === 'monthly') {
      const targetMonth = parseInt(month) || new Date().getMonth() + 1;
      const targetYear  = parseInt(year)  || new Date().getFullYear();
      const startOfMonth = new Date(Date.UTC(targetYear, targetMonth - 1, 1));
      const endOfMonth   = new Date(Date.UTC(targetYear, targetMonth, 0, 23, 59, 59, 999));

      const [openingIncomeResult, openingExpenseResult, incomeResult, expenseResult] = await Promise.all([
        IncomePayment.aggregate([
          { $match: { tenant_id: new mongoose.Types.ObjectId(tenantId), payment_date: { $lt: startOfMonth } } },
          { $group: { _id: null, total: { $sum: '$payment_amount' } } }
        ]),
        Expense.aggregate([
          { $match: { tenant_id: new mongoose.Types.ObjectId(tenantId), date: { $lt: startOfMonth } } },
          { $group: { _id: null, total: { $sum: '$amount' } } }
        ]),
        IncomePayment.aggregate([
          { $match: { tenant_id: new mongoose.Types.ObjectId(tenantId), payment_date: { $gte: startOfMonth, $lte: endOfMonth } } },
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
        Expense.aggregate([
          { $match: { tenant_id: new mongoose.Types.ObjectId(tenantId), date: { $gte: startOfMonth, $lte: endOfMonth } } },
          { $project: { date: '$date', category: '$category', paid_to: '$paid_to', amount: '$amount', payment_method: '$payment_method' } },
          { $sort: { date: 1 } }
        ])
      ]);

      const openingBalance = (openingIncomeResult[0]?.total || 0) - (openingExpenseResult[0]?.total || 0);
      const monthIncome    = incomeResult.reduce((s, i) => s + i.amount, 0);
      const monthExpense   = expenseResult.reduce((s, i) => s + i.amount, 0);

      res.status(200).json({
        type:                 'monthly',
        month:                targetMonth,
        year:                 targetYear,
        opening_balance:      openingBalance,
        income:               monthIncome,
        expense:              monthExpense,
        closing_balance:      openingBalance + monthIncome - monthExpense,
        income_transactions:  incomeResult,
        expense_transactions: expenseResult
      });

    } else if (type === 'annual') {
      const targetYear = parseInt(year) || new Date().getFullYear();
      const startOfYear = new Date(Date.UTC(targetYear, 0, 1));
      const endOfYear   = new Date(Date.UTC(targetYear, 11, 31, 23, 59, 59, 999));

      const [incomeResult, expenseResult] = await Promise.all([
        IncomePayment.aggregate([
          { $match: { tenant_id: new mongoose.Types.ObjectId(tenantId), payment_date: { $gte: startOfYear, $lte: endOfYear } } },
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
        Expense.aggregate([
          { $match: { tenant_id: new mongoose.Types.ObjectId(tenantId), date: { $gte: startOfYear, $lte: endOfYear } } },
          { $project: { date: '$date', category: '$category', paid_to: '$paid_to', amount: '$amount', payment_method: '$payment_method' } },
          { $sort: { date: 1 } }
        ])
      ]);

      const monthlyData = Array.from({ length: 12 }, (_, i) => {
        const startOfMonth = new Date(Date.UTC(targetYear, i, 1));
        const endOfMonth   = new Date(Date.UTC(targetYear, i + 1, 0, 23, 59, 59, 999));
        const mIncome  = incomeResult.filter(item => { const d = new Date(item.date); return d >= startOfMonth && d <= endOfMonth; }).reduce((s, x) => s + x.amount, 0);
        const mExpense = expenseResult.filter(item => { const d = new Date(item.date); return d >= startOfMonth && d <= endOfMonth; }).reduce((s, x) => s + x.amount, 0);
        return { month: i + 1, month_name: new Date(targetYear, i).toLocaleString('default', { month: 'long' }), income: mIncome, expense: mExpense, balance: mIncome - mExpense };
      });

      const totalIncome  = incomeResult.reduce((s, i) => s + i.amount, 0);
      const totalExpense = expenseResult.reduce((s, i) => s + i.amount, 0);

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
