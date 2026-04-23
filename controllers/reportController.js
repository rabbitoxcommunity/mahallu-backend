const IncomePayment = require('../models/IncomePayment');
const Expense = require('../models/Expense');
const Varisankhya = require('../models/Varisankhya');
const mongoose = require('mongoose');

// @desc    Get dashboard summary
// @route   GET /api/finance/reports/dashboard
// @access  Private
exports.getDashboardSummary = async (req, res, next) => {
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

    const totalIncome = totalIncomeResult[0]?.total || 0;
    const totalExpense = totalExpenseResult[0]?.total || 0;
    const thisMonthIncome = thisMonthIncomeResult[0]?.total || 0;
    const thisMonthExpense = thisMonthExpenseResult[0]?.total || 0;
    const balance = totalIncome - totalExpense;

    res.status(200).json({
      total_income: totalIncome,
      total_expense: totalExpense,
      balance,
      this_month_income: thisMonthIncome,
      this_month_expense: thisMonthExpense
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get monthly report
// @route   GET /api/finance/reports/monthly
// @access  Private
exports.getMonthlyReport = async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;
    const { month, year } = req.query;

    const targetMonth = parseInt(month) || new Date().getMonth() + 1;
    const targetYear = parseInt(year) || new Date().getFullYear();

    // Get start and end of target month in UTC
    const startOfMonth = new Date(Date.UTC(targetYear, targetMonth - 1, 1));
    const endOfMonth = new Date(Date.UTC(targetYear, targetMonth, 0, 23, 59, 59, 999));

    // Income for the month
    const incomeResult = await IncomePayment.aggregate([
      {
        $match: {
          tenant_id: new mongoose.Types.ObjectId(tenantId),
          payment_date: { $gte: startOfMonth, $lte: endOfMonth }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$payment_date' } },
          total: { $sum: '$payment_amount' }
        }
      },
      { $sort: { _id: 1 } }
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
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
          total: { $sum: '$amount' }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Calculate totals
    const totalIncome = incomeResult.reduce((sum, item) => sum + item.total, 0);
    const totalExpense = expenseResult.reduce((sum, item) => sum + item.total, 0);
    const balance = totalIncome - totalExpense;

    // Merge data by date
    const dateMap = new Map();
    incomeResult.forEach(item => dateMap.set(item._id, { date: item._id, income: item.total, expense: 0, balance: 0 }));
    expenseResult.forEach(item => {
      if (dateMap.has(item._id)) {
        dateMap.get(item._id).expense = item.total;
      } else {
        dateMap.set(item._id, { date: item._id, income: 0, expense: item.total, balance: 0 });
      }
    });

    // Calculate running balance
    let runningBalance = 0;
    const data = Array.from(dateMap.values()).map(item => {
      runningBalance += item.income - item.expense;
      return { ...item, balance: runningBalance };
    });

    res.status(200).json({
      month: targetMonth,
      year: targetYear,
      total_income: totalIncome,
      total_expense: totalExpense,
      balance,
      data
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get income report
// @route   GET /api/finance/reports/income
// @access  Private
exports.getIncomeReport = async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;
    const { date_from, date_to, category, payment_method } = req.query;

    const matchQuery = { tenant_id: new mongoose.Types.ObjectId(tenantId) };

    if (date_from || date_to) {
      matchQuery.payment_date = {};
      if (date_from) matchQuery.payment_date.$gte = new Date(date_from);
      if (date_to) matchQuery.payment_date.$lte = new Date(date_to);
    }

    if (payment_method) {
      matchQuery.payment_method = payment_method;
    }

    const incomeData = await IncomePayment.aggregate([
      { $match: matchQuery },
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
      { $sort: { date: -1 } }
    ]);

    // Category-wise totals
    const categoryTotals = await IncomePayment.aggregate([
      { $match: matchQuery },
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
        $group: {
          _id: '$category.name',
          total: { $sum: '$payment_amount' }
        }
      }
    ]);

    const totalIncome = incomeData.reduce((sum, item) => sum + item.amount, 0);

    res.status(200).json({
      total_income: totalIncome,
      category_totals: categoryTotals,
      data: incomeData
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get expense report
// @route   GET /api/finance/reports/expense
// @access  Private
exports.getExpenseReport = async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;
    const { date_from, date_to, category, payment_method } = req.query;

    const matchQuery = { tenant_id: new mongoose.Types.ObjectId(tenantId) };

    if (date_from || date_to) {
      matchQuery.date = {};
      if (date_from) matchQuery.date.$gte = new Date(date_from);
      if (date_to) matchQuery.date.$lte = new Date(date_to);
    }

    if (category) {
      matchQuery.category = category;
    }

    if (payment_method) {
      matchQuery.payment_method = payment_method;
    }

    const expenseData = await Expense.aggregate([
      { $match: matchQuery },
      {
        $project: {
          date: '$date',
          category: '$category',
          paid_to: '$paid_to',
          amount: '$amount',
          payment_method: '$payment_method'
        }
      },
      { $sort: { date: -1 } }
    ]);

    // Category-wise totals
    const categoryTotals = await Expense.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: '$category',
          total: { $sum: '$amount' }
        }
      }
    ]);

    const totalExpense = expenseData.reduce((sum, item) => sum + item.amount, 0);

    res.status(200).json({
      total_expense: totalExpense,
      category_totals: categoryTotals,
      data: expenseData
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get varisankhya report
// @route   GET /api/finance/reports/varisankhya
// @access  Private
exports.getVarisankhyaReport = async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;
    const { month, year } = req.query;

    const targetMonth = parseInt(month) || new Date().getMonth() + 1;
    const targetYear = parseInt(year) || new Date().getFullYear();

    const matchQuery = {
      tenant_id: new mongoose.Types.ObjectId(tenantId),
      month: targetMonth,
      year: targetYear
    };

    const varisankhyaData = await Varisankhya.aggregate([
      { $match: matchQuery },
      {
        $lookup: {
          from: 'houses',
          localField: 'house_id',
          foreignField: '_id',
          as: 'house'
        }
      },
      { $unwind: '$house' },
      {
        $project: {
          house_code: '$house.house_code',
          householder_name: '$house.householder_name',
          amount_due: '$amount_due',
          amount_paid: '$amount_paid',
          balance: { $subtract: ['$amount_due', '$amount_paid'] },
          status: '$status'
        }
      },
      { $sort: { house_code: 1 } }
    ]);

    const totalHouses = varisankhyaData.length;
    const paidHouses = varisankhyaData.filter(v => v.status === 'paid').length;
    const unpaidHouses = varisankhyaData.filter(v => v.status === 'unpaid').length;
    const partialHouses = varisankhyaData.filter(v => v.status === 'partial').length;
    const totalCollected = varisankhyaData.reduce((sum, v) => sum + v.amount_paid, 0);
    const pendingAmount = varisankhyaData.reduce((sum, v) => sum + (v.amount_due - v.amount_paid), 0);

    res.status(200).json({
      month: targetMonth,
      year: targetYear,
      total_houses: totalHouses,
      paid_houses: paidHouses,
      unpaid_houses: unpaidHouses,
      partial_houses: partialHouses,
      total_collected: totalCollected,
      pending_amount: pendingAmount,
      data: varisankhyaData
    });
  } catch (error) {
    next(error);
  }
};
