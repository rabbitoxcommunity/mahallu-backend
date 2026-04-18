const DueBasedIncome = require('../models/DueBasedIncome');
const DirectIncome = require('../models/DirectIncome');

// Generate unique due-based income code
const generateDueIncomeCode = async (tenant_id) => {
    try {
        const lastIncome = await DueBasedIncome.findOne({ tenant_id })
            .sort({ created_at: -1 })
            .select('income_code');
        
        let newNumber = 1;
        if (lastIncome && lastIncome.income_code) {
            const lastNumber = parseInt(lastIncome.income_code.split('-')[1]);
            newNumber = lastNumber + 1;
        }
        
        return `DUE-${String(newNumber).padStart(3, '0')}`;
    } catch (error) {
        console.error('Error generating due income code:', error);
        throw error;
    }
};

// Generate unique direct income code
const generateDirectIncomeCode = async (tenant_id) => {
    try {
        const lastIncome = await DirectIncome.findOne({ tenant_id })
            .sort({ created_at: -1 })
            .select('income_code');
        
        let newNumber = 1;
        if (lastIncome && lastIncome.income_code) {
            const lastNumber = parseInt(lastIncome.income_code.split('-')[1]);
            newNumber = lastNumber + 1;
        }
        
        return `DIR-${String(newNumber).padStart(3, '0')}`;
    } catch (error) {
        console.error('Error generating direct income code:', error);
        throw error;
    }
};

// Generate receipt number
const generateReceiptNo = async (tenant_id) => {
    try {
        const IncomePayment = require('../models/IncomePayment.js');
        const lastReceipt = await IncomePayment.findOne({ 
            tenant_id,
            receipt_no: { $ne: '' }
        })
        .sort({ created_at: -1 })
        .select('receipt_no');
        
        let newNumber = 1;
        if (lastReceipt && lastReceipt.receipt_no) {
            const lastNumber = parseInt(lastReceipt.receipt_no.split('-')[1]);
            newNumber = lastNumber + 1;
        }
        
        return `RCP-${String(newNumber).padStart(3, '0')}`;
    } catch (error) {
        console.error('Error generating receipt number:', error);
        throw error;
    }
};

// Update overdue status for due-based income
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
