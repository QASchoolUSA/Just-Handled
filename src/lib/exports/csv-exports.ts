import { format } from 'date-fns';
import Papa from 'papaparse';
import { Load, AccountSettings, SettlementSummary } from '@/lib/types';
import { downloadCsv } from '@/lib/utils';

export const exportInvoicesAsCsv = (loads: Load[], accounts: AccountSettings, weekEnd: Date) => {
    if (!loads || loads.length === 0) return;

    const periodEndStr = format(weekEnd, 'yyyy-MM-dd');
    const invoiceData = loads.map(load => ({
        InvoiceNo: load.loadNumber,
        Customer: accounts.factoringCompany,
        'Invoice Date': periodEndStr,
        'Due Date': periodEndStr,
        'Item(Description)': 'Freight',
        'Item(Amount)': load.invoiceAmount,
        'Class': 'Revenue'
    }));

    const csv = Papa.unparse(invoiceData);
    downloadCsv(csv, `QBO_Invoices_${periodEndStr}.csv`);
};

export const exportJournalAsCsv = (loads: Load[], settlementSummary: SettlementSummary[], accounts: AccountSettings, weekEnd: Date) => {
    if (!loads || loads.length === 0) return;

    const periodEndStr = format(weekEnd, 'yyyy-MM-dd');
    const journalEntries: any[] = [];
    let journalNo = 1;

    const fmt = (n: number) => n.toFixed(2);

    // 1. Factoring Entry
    const totalRevenue = loads.reduce((sum, l) => sum + l.invoiceAmount, 0);
    const totalFactoringFees = loads.reduce((sum, l) => sum + l.factoringFee, 0);

    journalEntries.push({ JournalNo: journalNo, 'Journal Date': periodEndStr, Account: accounts.factoringClearing, Debits: fmt(totalRevenue - totalFactoringFees), Credits: '', Name: accounts.factoringCompany, Description: 'Weekly factoring deposit' });
    journalEntries.push({ JournalNo: journalNo, 'Journal Date': periodEndStr, Account: accounts.factoringFees, Debits: fmt(totalFactoringFees), Credits: '', Name: '', Description: 'Weekly factoring fees' });
    journalEntries.push({ JournalNo: journalNo, 'Journal Date': periodEndStr, Account: 'Accounts Receivable', Debits: '', Credits: fmt(totalRevenue), Name: accounts.factoringCompany, Description: 'To clear factored invoices' });
    journalNo++;

    // 2. Driver Pay & Deductions Entries
    settlementSummary.forEach(summary => {
        if (summary.grossPay > 0) {
            journalEntries.push({ JournalNo: journalNo, 'Journal Date': periodEndStr, Account: accounts.driverPayExpense, Debits: fmt(summary.grossPay), Credits: '', Name: summary.driverName, Description: `Gross pay for ${summary.driverName}` });
            journalEntries.push({ JournalNo: journalNo, 'Journal Date': periodEndStr, Account: 'Accrued Driver Pay', Debits: '', Credits: fmt(summary.grossPay), Name: summary.driverName, Description: `To accrue pay for ${summary.driverName}` });
            journalNo++;
        }

        summary.deductions.forEach(deduction => {
            if (deduction.amount <= 0) return;
            let creditAccount = '';
            if (deduction.description.toLowerCase().includes('insurance')) {
                // Assuming insurance is paid out from a specific payable account
            } else if (deduction.description.toLowerCase().includes('escrow')) {
                creditAccount = accounts.escrowPayable;
            } else if (deduction.description.toLowerCase().includes('fuel') || deduction.description.toLowerCase().includes('advance')) {
                creditAccount = accounts.fuelAdvancesReceivable;
            } else {
                // Other deductions might go to a general 'Deductions Payable' or similar
            }

            if (creditAccount) { // Only create entry if we have a defined credit account
                journalEntries.push({ JournalNo: journalNo, 'Journal Date': periodEndStr, Account: 'Accrued Driver Pay', Debits: fmt(deduction.amount), Credits: '', Name: summary.driverName, Description: `Deduction: ${deduction.description}` });
                journalEntries.push({ JournalNo: journalNo, 'Journal Date': periodEndStr, Account: creditAccount, Debits: '', Credits: fmt(deduction.amount), Name: summary.driverName, Description: `To record deduction for ${summary.driverName}` });
                journalNo++;
            }
        });
    });

    const csv = Papa.unparse(journalEntries);
    downloadCsv(csv, `QBO_Journal_${periodEndStr}.csv`);
};
