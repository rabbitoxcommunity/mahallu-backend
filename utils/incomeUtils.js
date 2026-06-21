const Counter = require('../models/Counter');
const generateSequence = require('./generateSequence');
const DueBasedIncome = require('../models/DueBasedIncome');
const DirectIncome = require('../models/DirectIncome');

// Initialize counter from existing records if it hasn't been set up yet
const initCounterFromExisting = async (tenant_id, type, model, codeField, prefix) => {
    const existing = await Counter.findOne({ tenant_id, type });
    if (existing) return;

    const last = await model.findOne({ tenant_id })
        .sort({ [codeField]: -1 })
        .select(codeField);

    if (last?.[codeField]) {
        const n = parseInt(last[codeField].split('-')[1]);
        if (!isNaN(n) && n > 0) {
            try {
                await Counter.create({ tenant_id, type, seq: n });
            } catch (e) {
                // Concurrent request already created it — that's fine
            }
        }
    }
};

const generateDueIncomeCode = async (tenant_id) => {
    try {
        await initCounterFromExisting(tenant_id, 'due_income', DueBasedIncome, 'income_code', 'DUE');
        return generateSequence(tenant_id, 'due_income', 'DUE');
    } catch (error) {
        console.error('Error generating due income code:', error);
        throw error;
    }
};

const generateDirectIncomeCode = async (tenant_id) => {
    try {
        await initCounterFromExisting(tenant_id, 'direct_income', DirectIncome, 'income_code', 'DIR');
        return generateSequence(tenant_id, 'direct_income', 'DIR');
    } catch (error) {
        console.error('Error generating direct income code:', error);
        throw error;
    }
};

const generateReceiptNo = async (tenant_id) => {
    try {
        const IncomePayment = require('../models/IncomePayment.js');
        await initCounterFromExisting(tenant_id, 'receipt', IncomePayment, 'receipt_no', 'RCP');
        return generateSequence(tenant_id, 'receipt', 'RCP');
    } catch (error) {
        console.error('Error generating receipt number:', error);
        throw error;
    }
};

const updateOverdueStatus = async (tenant_id) => {
    try {
        const today = new Date();

        const overdueIncomes = await DueBasedIncome.find({
            tenant_id,
            status: { $in: ['unpaid', 'partial'] },
            due_date: { $lt: today },
            is_active: true
        });

        const updatePromises = overdueIncomes.map(income => {
            income.status = 'overdue';
            return income.save();
        });

        await Promise.all(updatePromises);

        return { updated_count: overdueIncomes.length };
    } catch (error) {
        console.error('Error updating overdue status:', error);
        throw error;
    }
};

module.exports = {
    generateDueIncomeCode,
    generateDirectIncomeCode,
    generateReceiptNo,
    updateOverdueStatus
};
