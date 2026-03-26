import Papa from 'papaparse';
import { format } from 'date-fns';
import { Load, AccountSettings, SettlementSummary } from '@/lib/types';

export const generateInvoiceCSV = (loads: Load[], accounts: AccountSettings): string => {
    const invoiceData = loads.map(load => {
        // Use delivery date as invoice date if available, otherwise current date or load date?
        // Logic from SettlementsPage used weekEnd. Here we might not have a single "weekEnd".
        // We generally want the invoice date to be the delivery date or the end of the selected period?
        // The user asked for "invoices for specific period".
        // Let's use the load's delivery date as the default invoice date, or today's date?
        // SettlementsPage used `periodEndStr` (weekEnd).
        // For a report over a range, using the Load's specific Invoice Date (or Delivery Date) seems more accurate implies row-by-row accuracy.
        // However, if the requirement is "Export invoices for specific period", maybe they want them all dated to the end of that period?
        // Let's stick to using the Load's delivery date if possible, but fallback to period end if needed.
        // Actually, looking at SettlementsPage: `const periodEndStr = format(weekEnd, 'yyyy-MM-dd')`.
        // It sets 'Invoice Date' and 'Due Date' to the period end.
        // Let's follow that pattern but maybe pass the period end date.
        // But for a 12 month report, dating everything to the end of the year might be wrong.
        // Let's use the load's Delivery Date as the Invoice Date for individual accuracy in a broad report.

        // dateStr normalization
        const dateStr = load.deliveryDate || format(new Date(), 'yyyy-MM-dd');

        return {
            InvoiceNo: load.loadNumber,
            Customer: accounts.factoringCompany,
            'Invoice Date': dateStr,
            'Due Date': dateStr,
            'Item(Description)': 'Freight',
            'Item(Amount)': load.invoiceAmount,
            'Class': 'Revenue'
        };
    });

    return Papa.unparse(invoiceData);
};

export const generateJournalCSV = (
    loads: Load[],
    settlementSummary: SettlementSummary[],
    accounts: AccountSettings,
    periodEnd: Date
): string => {
    const periodEndStr = format(periodEnd, 'yyyy-MM-dd');
    const journalEntries: any[] = [];
    let journalNo = 1;

    const fmt = (n: number) => n.toFixed(2);

    // 1. Factoring Entry (Aggregated for the whole period? Or per load? Settlements did it per WEEK (aggregated loads))
    // If we run this for 1 month, we probably want ONE big entry? Or one per week?
    // "export journal entries... for specific period".
    // Usually journal entries are done per settlement period (weekly).
    // If selecting "Last 3 months", having one giant entry might be unmanageable or incorrect if they want to import weekly.
    // However, without grouping by week here, we can only do either "Per Load" (too grainy) or "Aggregated" (too chunky).
    // Given the SettlementsPage logic aggregates `loads`, let's assume the user wants an aggregation of the selected period.
    // If they select "Last Month", they get one Journal Entry block for that month's totals.

    const totalRevenue = loads.reduce((sum, l) => sum + l.invoiceAmount, 0);
    // Option A: a single debit line to factoring fees = factoringFee + transactionFee
    const totalFactoringCosts = loads.reduce((sum, l) => sum + (l.factoringFee || 0) + (l.transactionFee || 0), 0);

    journalEntries.push({ JournalNo: journalNo, 'Journal Date': periodEndStr, Account: accounts.factoringClearing, Debits: fmt(totalRevenue - totalFactoringCosts), Credits: '', Name: accounts.factoringCompany, Description: 'Factoring deposit' });
    journalEntries.push({ JournalNo: journalNo, 'Journal Date': periodEndStr, Account: accounts.factoringFees, Debits: fmt(totalFactoringCosts), Credits: '', Name: '', Description: 'Factoring fees' });
    journalEntries.push({ JournalNo: journalNo, 'Journal Date': periodEndStr, Account: 'Accounts Receivable', Debits: '', Credits: fmt(totalRevenue), Name: accounts.factoringCompany, Description: 'To clear factored invoices' });
    journalNo++;

    // 2. Driver Pay & Deductions Entries
    settlementSummary.forEach(summary => {
        if (summary.grossPay > 0) {
            journalEntries.push({ JournalNo: journalNo, 'Journal Date': periodEndStr, Account: accounts.driverPayExpense, Debits: fmt(summary.grossPay), Credits: '', Name: summary.driverName, Description: `Gross pay for ${summary.driverName}` });
            journalEntries.push({ JournalNo: journalNo, 'Journal Date': periodEndStr, Account: 'Accounts Payable', Debits: '', Credits: fmt(summary.grossPay), Name: summary.driverName, Description: `To accrue pay for ${summary.driverName}` });
            journalNo++;
        }

        summary.deductions.forEach(deduction => {
            if (deduction.amount <= 0) return;
            let creditAccount = '';
            const desc = deduction.description.toLowerCase();

            if (desc.includes('insurance')) {
                // Assuming insurance is paid out from a specific payable account
            } else if (desc.includes('escrow')) {
                creditAccount = accounts.escrowPayable;
            } else if (desc.includes('fuel') || desc.includes('advance')) {
                creditAccount = accounts.fuelAdvancesReceivable;
            } else {
                // Other deductions might go to a general 'Deductions Payable' or similar
            }

            if (creditAccount) { // Only create entry if we have a defined credit account
                journalEntries.push({ JournalNo: journalNo, 'Journal Date': periodEndStr, Account: 'Accounts Payable', Debits: fmt(deduction.amount), Credits: '', Name: summary.driverName, Description: `Deduction: ${deduction.description}` });
                journalEntries.push({ JournalNo: journalNo, 'Journal Date': periodEndStr, Account: creditAccount, Debits: '', Credits: fmt(deduction.amount), Name: summary.driverName, Description: `To record deduction for ${summary.driverName}` });
                journalNo++;
            }
        });
    });

    return Papa.unparse(journalEntries);
};
