const IncomePayment = require('../models/IncomePayment');
const Expense = require('../models/Expense');
const Varisankhya = require('../models/Varisankhya');
const mongoose = require('mongoose');

// @desc    Get summary
// @route   GET /api/finance/reports/summary
// @access  Private
exports.getSummary = async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    // Get start and end of current month in UTC
    const startOfMonth = new Date(Date.UTC(currentYear, currentMonth - 1, 1));
    const endOfMonth = new Date(Date.UTC(currentYear, currentMonth, 0, 23, 59, 59, 999));

    // Total Income
    const totalIncomeResult = await IncomePayment.aggregate([
      { $match: { tenant_id: new mongoose.Types.ObjectId(tenantId) } },
      { $group: { _id: null, total: { $sum: '$payment_amount' } } }
    ]);

    // Total Expense
    const totalExpenseResult = await Expense.aggregate([
      { $match: { tenant_id: new mongoose.Types.ObjectId(tenantId) } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    // This Month Income
    const thisMonthIncomeResult = await IncomePayment.aggregate([
      {
        $match: {
          tenant_id: new mongoose.Types.ObjectId(tenantId),
          payment_date: { $gte: startOfMonth, $lte: endOfMonth }
        }
      },
      { $group: { _id: null, total: { $sum: '$payment_amount' } } }
    ]);

    // This Month Expense
    const thisMonthExpenseResult = await Expense.aggregate([
      {
        $match: {
          tenant_id: new mongoose.Types.ObjectId(tenantId),
          date: { $gte: startOfMonth, $lte: endOfMonth }
        }
      },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    // Total Varisankhya Collected
    const totalVarisankhyaResult = await Varisankhya.aggregate([
      { $match: { tenant_id: new mongoose.Types.ObjectId(tenantId) } },
      { $group: { _id: null, total: { $sum: '$amount_paid' } } }
    ]);

    const totalIncome = totalIncomeResult[0]?.total || 0;
    const totalExpense = totalExpenseResult[0]?.total || 0;
    const thisMonthIncome = thisMonthIncomeResult[0]?.total || 0;
    const thisMonthExpense = thisMonthExpenseResult[0]?.total || 0;
    const totalVarisankhya = totalVarisankhyaResult[0]?.total || 0;
    const balance = totalIncome - totalExpense;

    res.status(200).json({
      total_income: totalIncome,
      total_expense: totalExpense,
      balance,
      this_month_income: thisMonthIncome,
      this_month_expense: thisMonthExpense,
      total_varisankhya: totalVarisankhya
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
    const targetYear = parseInt(year) || new Date().getFullYear();

    // Get start and end of target month in UTC
    const startOfMonth = new Date(Date.UTC(targetYear, targetMonth - 1, 1));
    const endOfMonth = new Date(Date.UTC(targetYear, targetMonth, 0, 23, 59, 59, 999));

    // Get all income before this month (for opening balance)
    const openingIncomeResult = await IncomePayment.aggregate([
      {
        $match: {
          tenant_id: new mongoose.Types.ObjectId(tenantId),
          payment_date: { $lt: startOfMonth }
        }
      },
      { $group: { _id: null, total: { $sum: '$payment_amount' } } }
    ]);

    // Get all expense before this month (for opening balance)
    const openingExpenseResult = await Expense.aggregate([
      {
        $match: {
          tenant_id: new mongoose.Types.ObjectId(tenantId),
          date: { $lt: startOfMonth }
        }
      },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    // Income for the month
    const incomeResult = await IncomePayment.aggregate([
      {
        $match: {
          tenant_id: new mongoose.Types.ObjectId(tenantId),
          payment_date: { $gte: startOfMonth, $lte: endOfMonth }
        }
      },
      {
        $lookup: {
          from: 'duebasedincomes',
          localField: 'due_income_id',
          foreignField: '_id',
          as: 'due_income'
        }
      },
      { $unwind: '$due_income' },
      {
        $lookup: {
          from: 'incomecategories',
          localField: 'due_income.category_id',
          foreignField: '_id',
          as: 'category'
        }
      },
      { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          date: '$payment_date',
          category: '$category.name',
          source: '$due_income.source',
          amount: '$payment_amount',
          payment_method: '$payment_method'
        }
      },
      { $sort: { date: 1 } }
    ]);

    // Expense for the month
    const expenseResult = await Expense.aggregate([
      {
        $match: {
          tenant_id: new mongoose.Types.ObjectId(tenantId),
          date: { $gte: startOfMonth, $lte: endOfMonth }
        }
      },
      {
        $project: {
          date: '$date',
          category: '$category',
          paid_to: '$paid_to',
          amount: '$amount',
          payment_method: '$payment_method'
        }
      },
      { $sort: { date: 1 } }
    ]);

    // Calculate totals
    const openingIncome = openingIncomeResult[0]?.total || 0;
    const openingExpense = openingExpenseResult[0]?.total || 0;
    const openingBalance = openingIncome - openingExpense;

    const monthIncome = incomeResult.reduce((sum, item) => sum + item.amount, 0);
    const monthExpense = expenseResult.reduce((sum, item) => sum + item.amount, 0);
    const closingBalance = openingBalance + monthIncome - monthExpense;

    // Category-wise breakdown for income
    const incomeCategoryBreakdown = await IncomePayment.aggregate([
      {
        $match: {
          tenant_id: new mongoose.Types.ObjectId(tenantId),
          payment_date: { $gte: startOfMonth, $lte: endOfMonth }
        }
      },
      {
        $lookup: {
          from: 'duebasedincomes',
          localField: 'due_income_id',
          foreignField: '_id',
          as: 'due_income'
        }
      },
      { $unwind: '$due_income' },
      {
        $group: {
          _id: '$due_income.category',
          total: { $sum: '$payment_amount' }
        }
      }
    ]);

    // Category-wise breakdown for expense
    const expenseCategoryBreakdown = await Expense.aggregate([
      {
        $match: {
          tenant_id: new mongoose.Types.ObjectId(tenantId),
          date: { $gte: startOfMonth, $lte: endOfMonth }
        }
      },
      {
        $group: {
          _id: '$category',
          total: { $sum: '$amount' }
        }
      }
    ]);

    res.status(200).json({
      month: targetMonth,
      year: targetYear,
      opening_balance: openingBalance,
      opening_income: openingIncome,
      opening_expense: openingExpense,
      month_income: monthIncome,
      month_expense: monthExpense,
      closing_balance: closingBalance,
      income_breakdown: incomeCategoryBreakdown,
      expense_breakdown: expenseCategoryBreakdown,
      income_transactions: incomeResult,
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

    // Start from January of current year
    for (let i = 0; i < numberOfMonths; i++) {
      const date = new Date(currentYear, i, 1);
      const month = date.getMonth() + 1;
      const year = date.getFullYear();

      const startOfMonth = new Date(Date.UTC(year, month - 1, 1));
      const endOfMonth = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

      // Income for this month
      const incomeResult = await IncomePayment.aggregate([
        {
          $match: {
            tenant_id: new mongoose.Types.ObjectId(tenantId),
            payment_date: { $gte: startOfMonth, $lte: endOfMonth }
          }
        },
        { $group: { _id: null, total: { $sum: '$payment_amount' } } }
      ]);

      // Expense for this month
      const expenseResult = await Expense.aggregate([
        {
          $match: {
            tenant_id: new mongoose.Types.ObjectId(tenantId),
            date: { $gte: startOfMonth, $lte: endOfMonth }
          }
        },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]);

      trendsData.push({
        month: date.toLocaleString('default', { month: 'short' }),
        year: year,
        income: incomeResult[0]?.total || 0,
        expense: expenseResult[0]?.total || 0,
        balance: (incomeResult[0]?.total || 0) - (expenseResult[0]?.total || 0)
      });
    }

    // Calculate growth rates
    const growthData = trendsData.map((item, index) => {
      if (index === 0) {
        return { ...item, income_growth: 0, expense_growth: 0 };
      }
      const prevItem = trendsData[index - 1];
      const incomeGrowth = prevItem.income > 0 
        ? ((item.income - prevItem.income) / prevItem.income) * 100 
        : 0;
      const expenseGrowth = prevItem.expense > 0 
        ? ((item.expense - prevItem.expense) / prevItem.expense) * 100 
        : 0;
      return { ...item, income_growth: incomeGrowth, expense_growth: expenseGrowth };
    });

    res.status(200).json({
      data: trendsData,
      growth: growthData
    });
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
      const targetYear = parseInt(year) || new Date().getFullYear();

      const startOfMonth = new Date(Date.UTC(targetYear, targetMonth - 1, 1));
      const endOfMonth = new Date(Date.UTC(targetYear, targetMonth, 0, 23, 59, 59, 999));

      // Get opening balance
      const openingIncomeResult = await IncomePayment.aggregate([
        {
          $match: {
            tenant_id: new mongoose.Types.ObjectId(tenantId),
            payment_date: { $lt: startOfMonth }
          }
        },
        { $group: { _id: null, total: { $sum: '$payment_amount' } } }
      ]);

      const openingExpenseResult = await Expense.aggregate([
        {
          $match: {
            tenant_id: new mongoose.Types.ObjectId(tenantId),
            date: { $lt: startOfMonth }
          }
        },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]);

      const openingIncome = openingIncomeResult[0]?.total || 0;
      const openingExpense = openingExpenseResult[0]?.total || 0;
      const openingBalance = openingIncome - openingExpense;

      // Get transactions
      const incomeResult = await IncomePayment.aggregate([
        {
          $match: {
            tenant_id: new mongoose.Types.ObjectId(tenantId),
            payment_date: { $gte: startOfMonth, $lte: endOfMonth }
          }
        },
        {
          $lookup: {
            from: 'duebasedincomes',
            localField: 'due_income_id',
            foreignField: '_id',
            as: 'due_income'
          }
        },
        { $unwind: '$due_income' },
        {
          $lookup: {
            from: 'incomecategories',
            localField: 'due_income.category_id',
            foreignField: '_id',
            as: 'category'
          }
        },
        { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            date: '$payment_date',
            category: '$category.name',
            source: '$due_income.source',
            amount: '$payment_amount',
            payment_method: '$payment_method'
          }
        },
        { $sort: { date: 1 } }
      ]);

      const expenseResult = await Expense.aggregate([
        {
          $match: {
            tenant_id: new mongoose.Types.ObjectId(tenantId),
            date: { $gte: startOfMonth, $lte: endOfMonth }
          }
        },
        {
          $project: {
            date: '$date',
            category: '$category',
            paid_to: '$paid_to',
            amount: '$amount',
            payment_method: '$payment_method'
          }
        },
        { $sort: { date: 1 } }
      ]);

      const monthIncome = incomeResult.reduce((sum, item) => sum + item.amount, 0);
      const monthExpense = expenseResult.reduce((sum, item) => sum + item.amount, 0);
      const closingBalance = openingBalance + monthIncome - monthExpense;

      res.status(200).json({
        type: 'monthly',
        month: targetMonth,
        year: targetYear,
        opening_balance: openingBalance,
        income: monthIncome,
        expense: monthExpense,
        closing_balance: closingBalance,
        income_transactions: incomeResult,
        expense_transactions: expenseResult
      });
    } else if (type === 'annual') {
      const targetYear = parseInt(year) || new Date().getFullYear();

      const startOfYear = new Date(Date.UTC(targetYear, 0, 1));
      const endOfYear = new Date(Date.UTC(targetYear, 11, 31, 23, 59, 59, 999));

      // Get all transactions for the year
      const incomeResult = await IncomePayment.aggregate([
        {
          $match: {
            tenant_id: new mongoose.Types.ObjectId(tenantId),
            payment_date: { $gte: startOfYear, $lte: endOfYear }
          }
        },
        {
          $lookup: {
            from: 'duebasedincomes',
            localField: 'due_income_id',
            foreignField: '_id',
            as: 'due_income'
          }
        },
        { $unwind: '$due_income' },
        {
          $lookup: {
            from: 'incomecategories',
            localField: 'due_income.category_id',
            foreignField: '_id',
            as: 'category'
          }
        },
        { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            date: '$payment_date',
            category: '$category.name',
            source: '$due_income.source',
            amount: '$payment_amount',
            payment_method: '$payment_method'
          }
        },
        { $sort: { date: 1 } }
      ]);

      const expenseResult = await Expense.aggregate([
        {
          $match: {
            tenant_id: new mongoose.Types.ObjectId(tenantId),
            date: { $gte: startOfYear, $lte: endOfYear }
          }
        },
        {
          $project: {
            date: '$date',
            category: '$category',
            paid_to: '$paid_to',
            amount: '$amount',
            payment_method: '$payment_method'
          }
        },
        { $sort: { date: 1 } }
      ]);

      // Monthly breakdown
      const monthlyData = [];
      for (let i = 0; i < 12; i++) {
        const startOfMonth = new Date(Date.UTC(targetYear, i, 1));
        const endOfMonth = new Date(Date.UTC(targetYear, i + 1, 0, 23, 59, 59, 999));

        const monthIncome = incomeResult.filter(item => {
          const itemDate = new Date(item.date);
          return itemDate >= startOfMonth && itemDate <= endOfMonth;
        }).reduce((sum, item) => sum + item.amount, 0);

        const monthExpense = expenseResult.filter(item => {
          const itemDate = new Date(item.date);
          return itemDate >= startOfMonth && itemDate <= endOfMonth;
        }).reduce((sum, item) => sum + item.amount, 0);

        monthlyData.push({
          month: i + 1,
          month_name: new Date(targetYear, i).toLocaleString('default', { month: 'long' }),
          income: monthIncome,
          expense: monthExpense,
          balance: monthIncome - monthExpense
        });
      }

      const totalIncome = incomeResult.reduce((sum, item) => sum + item.amount, 0);
      const totalExpense = expenseResult.reduce((sum, item) => sum + item.amount, 0);

      res.status(200).json({
        type: 'annual',
        year: targetYear,
        total_income: totalIncome,
        total_expense: totalExpense,
        balance: totalIncome - totalExpense,
        monthly_breakdown: monthlyData,
        income_transactions: incomeResult,
        expense_transactions: expenseResult
      });
    } else {
      res.status(400).json({ message: 'Invalid export type. Use "monthly" or "annual"' });
    }
  } catch (error) {
    next(error);
  }
};
