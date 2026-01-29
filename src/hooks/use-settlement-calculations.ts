
import { useMemo } from 'react';
import type { Load, Driver, Expense, Owner, SettlementSummary, OwnerSettlementSummary } from '@/lib/types';
import { isWithinInterval } from 'date-fns';
import { toTitleCase, calculateDriverPay, normalizeDateFormat } from '@/lib/utils'; // Assuming normalizeDateFormat is exported now

// Helper local to this file or imported if used elsewhere
// We'll use the one from utils if available, or reproduce basic logic if it was inline.
// normalizeDateFormat was moved to utils, so we import it.

const parseDateHelper = (dateStr: string) => {
    if (!dateStr) return new Date();

    // Try ISO first (YYYY-MM-DD)
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        return new Date(dateStr + 'T00:00:00'); // Ensure local time or UTC as needed
    }

    // Try Legacy (dd-MMM-yy) - Logic duplicated from page.tsx or we trust normalizeDateFormat?
    // page.tsx logic was:
    // if (/\d{1,2}-[a-zA-Z]{3}-\d{2}/.test(dateStr)) ...
    // Let's use normalizeDateFormat from utils which standardizes to YYYY-MM-DD
    const standardized = normalizeDateFormat(dateStr);
    return new Date(standardized + 'T00:00:00');
};


export function useSettlementCalculations(
    drivers: Driver[] | null,
    loads: Load[] | null,
    expenses: Expense[] | null,
    owners: Owner[] | null, // Added owners
    weekStart: Date,
    weekEnd: Date,
    driverMap: Map<string, Driver> // Optimization passed in
) {

    // --- Driver Settlement Calculation ---
    const settlementSummary = useMemo<SettlementSummary[]>(() => {
        if (!drivers || !loads || !expenses) return [];

        const summaryByDriver: Map<string, SettlementSummary> = new Map();
        const weekInterval = { start: weekStart, end: weekEnd };
        const recurringDate = weekEnd.toISOString(); // Use end of week for recurring deductions

        drivers.forEach(driver => {
            const recurringDeductions = [
                { id: `ins-${driver.id}`, description: 'Weekly Insurance', amount: driver.recurringDeductions.insurance, type: 'driver' as const, date: recurringDate, driverId: driver.id, isRecurring: true },
                { id: `esc-${driver.id}`, description: 'Weekly Escrow', amount: driver.recurringDeductions.escrow, type: 'driver' as const, date: recurringDate, driverId: driver.id, isRecurring: true }
            ].filter(d => d.amount > 0);

            summaryByDriver.set(driver.id, {
                driverId: driver.id,
                driverName: toTitleCase(`${driver.firstName} ${driver.lastName}`),
                unitId: driver.unitId,
                grossPay: 0,
                totalDeductions: recurringDeductions.reduce((sum, d) => sum + d.amount, 0),
                totalAdditions: 0,
                netPay: 0,
                loads: [],
                deductions: recurringDeductions,
                additions: [],
            });
        });

        loads.forEach(load => {
            // Filter load by week
            // load.deliveryDate can be 'dd-MMM-yy' or 'yyyy-MM-dd'
            const deliveryDate = parseDateHelper(load.deliveryDate);
            if (!isWithinInterval(deliveryDate, weekInterval)) return;

            const driver = driverMap.get(load.driverId);
            const summary = summaryByDriver.get(load.driverId);
            if (driver && summary) {
                const loadPay = calculateDriverPay(load, driver);
                summary.grossPay += loadPay;
                summary.loads.push(load);
            }
        });

        expenses.forEach(expense => {
            // Filter expense by week
            // Use new Date() for broader compatibility matching filteredExpenses logic
            const expenseDate = new Date(expense.date + 'T00:00:00');
            if (!isWithinInterval(expenseDate, weekInterval)) return;

            if (expense.type === 'driver' && expense.driverId) {
                const summary = summaryByDriver.get(expense.driverId);
                if (summary) {
                    if (expense.category === 'addition') {
                        summary.totalAdditions += expense.amount;
                        summary.additions.push(expense);
                    } else {
                        summary.totalDeductions += expense.amount;
                        summary.deductions.push(expense);
                    }
                }
            }
        });

        summaryByDriver.forEach(summary => {
            summary.netPay = summary.grossPay + summary.totalAdditions - summary.totalDeductions;
        });

        return Array.from(summaryByDriver.values()).filter(s => s.loads.length > 0 || s.deductions.some(d => !d.isRecurring) || s.additions.length > 0);
    }, [loads, expenses, drivers, driverMap, weekStart, weekEnd]);

    // --- Owner Settlement Calculation ---
    const ownerSettlementSummary = useMemo<OwnerSettlementSummary[]>(() => {
        if (!owners || !loads || !expenses) return []; // added expenses check since it's used

        const summaryByOwner: Map<string, OwnerSettlementSummary> = new Map();
        const weekInterval = { start: weekStart, end: weekEnd };
        const recurringDate = weekEnd.toISOString();

        owners.forEach(owner => {
            // Calculate weekly recurring deductions
            const recurringDeductions = [
                { id: `ins-${owner.id}`, description: 'Weekly Insurance', amount: owner.recurringDeductions.insurance, type: 'company' as const, date: recurringDate, ownerId: owner.id, isRecurring: true }, // Using company type but logic treats as deduction
                { id: `esc-${owner.id}`, description: 'Weekly Escrow', amount: owner.recurringDeductions.escrow, type: 'company' as const, date: recurringDate, ownerId: owner.id, isRecurring: true },
                { id: `eld-${owner.id}`, description: 'ELD', amount: owner.recurringDeductions.eld, type: 'company' as const, date: recurringDate, ownerId: owner.id, isRecurring: true },
                { id: `admin-${owner.id}`, description: 'Admin Fee', amount: owner.recurringDeductions.adminFee, type: 'company' as const, date: recurringDate, ownerId: owner.id, isRecurring: true },
                { id: `fuel-${owner.id}`, description: 'Fuel/Tolls (Recurring)', amount: (owner.recurringDeductions.fuel || 0) + (owner.recurringDeductions.tolls || 0), type: 'company' as const, date: recurringDate, ownerId: owner.id, isRecurring: true },
            ].filter(d => d.amount > 0) as any[]; // casting to match structure

            summaryByOwner.set(owner.id, {
                ownerId: owner.id,
                ownerName: owner.name,
                unitId: owner.unitId,
                grossPay: 0,
                totalDeductions: recurringDeductions.reduce((sum, d) => sum + d.amount, 0),
                totalAdditions: 0,
                netPay: 0,
                loads: [],
                deductions: recurringDeductions,
                additions: [],
            });
        });

        loads.forEach(load => {
            const deliveryDate = parseDateHelper(load.deliveryDate);
            if (!isWithinInterval(deliveryDate, weekInterval)) return;

            // Find owner by truckId -> unitId
            if (!load.truckId) return;

            // This search is O(N*M), could be optimized with map but owners list is small
            const owner = owners.find(o => o.unitId === load.truckId);

            if (owner) {
                const summary = summaryByOwner.get(owner.id);
                if (summary) {
                    // Owner Pay = Invoice Amount * Percentage
                    const pay = load.invoiceAmount * owner.percentage;
                    summary.grossPay += pay;
                    summary.loads.push(load);

                    // Calculate Driver Pay (Expense for Owner)
                    const driver = driverMap.get(load.driverId);
                    if (driver) {
                        const driverPay = calculateDriverPay(load, driver);
                        if (driverPay > 0) {
                            summary.totalDeductions += driverPay;
                            summary.deductions.push({
                                id: `driver-pay-${load.id}`,
                                description: `Driver Pay - Load #${load.loadNumber} (${driver.firstName} ${driver.lastName})`,
                                amount: driverPay,
                                date: load.deliveryDate,
                                type: 'owner',
                                ownerId: owner.id,
                                expenseCategory: 'Driver Pay' // This triggers grouping in UI/PDF
                            } as Expense);
                        }
                    }
                }
            }
        });

        // Populate deductions/additions from expenses for Owners
        expenses.forEach(expense => {
            const expenseDate = new Date(expense.date + 'T00:00:00'); // Consistent timezone handling
            if (!isWithinInterval(expenseDate, weekInterval)) return;


            if (expense.type === 'owner' && expense.ownerId) {
                const summary = summaryByOwner.get(expense.ownerId);
                if (summary) {
                    if (expense.category === 'addition') {
                        summary.totalAdditions += expense.amount;
                        summary.additions.push(expense);
                    } else {
                        // Treat specific owner expenses as deductions from their pay
                        summary.totalDeductions += expense.amount;
                        summary.deductions.push(expense);
                    }
                }
            }
        });

        summaryByOwner.forEach(summary => {
            summary.netPay = summary.grossPay + summary.totalAdditions - summary.totalDeductions;
        });

        return Array.from(summaryByOwner.values()).filter(s => s.loads.length > 0 || s.deductions.some(d => !d.isRecurring));

    }, [loads, owners, expenses, weekStart, weekEnd, driverMap]);

    return { settlementSummary, ownerSettlementSummary };
}
