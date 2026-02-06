"use client";

import { useState, useMemo } from "react";
import { format, subMonths, startOfDay, endOfDay } from "date-fns";
import { Calendar as CalendarIcon, ArrowLeft, Download, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCollection, useFirestore, useMemoFirebase } from "@/firebase";
import { collection, query, where } from "firebase/firestore";
import type { Load, Expense, Driver, Owner } from "@/lib/types";
import { useSettlementCalculations } from "@/hooks/use-settlement-calculations";
import { DateRange } from "react-day-picker";
import Link from "next/link";

export default function ProfitLossPage() {
    const firestore = useFirestore();

    // --- Date State ---
    const [dateRange, setDateRange] = useState<DateRange | undefined>({
        from: startOfDay(subMonths(new Date(), 1)),
        to: endOfDay(new Date())
    });

    // --- Data Fetching ---
    const fromStr = dateRange?.from ? format(dateRange.from, 'yyyy-MM-dd') : '';
    const toStr = dateRange?.to ? format(dateRange.to, 'yyyy-MM-dd') : '';

    const loadsQuery = useMemoFirebase(() => {
        if (!firestore || !fromStr || !toStr) return null;
        return query(
            collection(firestore, 'loads'),
            where('deliveryDate', '>=', fromStr),
            where('deliveryDate', '<=', toStr)
        );
    }, [firestore, fromStr, toStr]);

    const expensesQuery = useMemoFirebase(() => {
        if (!firestore || !fromStr || !toStr) return null;
        return query(
            collection(firestore, 'expenses'),
            where('date', '>=', fromStr),
            where('date', '<=', toStr)
        );
    }, [firestore, fromStr, toStr]);

    const driversQuery = useMemoFirebase(() => firestore ? collection(firestore, 'drivers') : null, [firestore]);
    const ownersQuery = useMemoFirebase(() => firestore ? collection(firestore, 'owners') : null, [firestore]);

    const { data: loads, loading: loadsLoading } = useCollection<Load>(loadsQuery);
    const { data: expenses, loading: expensesLoading } = useCollection<Expense>(expensesQuery);
    const { data: drivers, loading: driversLoading } = useCollection<Driver>(driversQuery);
    const { data: owners, loading: ownersLoading } = useCollection<Owner>(ownersQuery);

    const loading = loadsLoading || expensesLoading || driversLoading || ownersLoading;

    // --- Calculations ---
    const driverMap = useMemo(() => new Map(drivers?.map((d) => [d.id, d])), [drivers]);

    // Use settlement calculations to get accurate driver pay
    const { settlementSummary } = useSettlementCalculations(
        drivers || [],
        loads || [],
        expenses || [],
        owners || [],
        dateRange?.from || new Date(),
        dateRange?.to || new Date(),
        driverMap
    );

    const metrics = useMemo(() => {
        if (!loads || !expenses || !settlementSummary) return null;

        // 1. Gross Operating Revenue
        const linehaulRevenue = loads.reduce((sum, load) => sum + (load.invoiceAmount || 0), 0);
        // Note: Fuel Surcharge, Detention etc are usually part of invoiceAmount in current model
        // We will list them as 0 if not separable, or assume invoiceAmount is total.
        const totalRevenue = linehaulRevenue;

        // 2. Cost of Goods Sold
        // Fuel
        const fuelCost = expenses
            .filter(e => e.expenseCategory === 'Fuel' || e.description?.toLowerCase().includes('fuel'))
            .reduce((sum, e) => sum + (e.amount || 0), 0);

        // Driver Wages (Gross Pay from settlements)
        const driverWages = settlementSummary.reduce((sum, s) => sum + (s.grossPay || 0), 0);

        // Tolls
        const tolls = expenses
            .filter(e => e.expenseCategory === 'Tolls' || e.description?.toLowerCase().includes('toll'))
            .reduce((sum, e) => sum + (e.amount || 0), 0);

        // Dispatch Fees (if tracked separately in expenses or deductions)
        // Check expenses for 'Dispatch'
        const dispatchFees = expenses
            .filter(e => e.description?.toLowerCase().includes('dispatch'))
            .reduce((sum, e) => sum + (e.amount || 0), 0);

        const totalCOGS = fuelCost + driverWages + tolls + dispatchFees;
        const grossProfit = totalRevenue - totalCOGS;

        // 3. Operating Expenses
        // We can group remaining expenses by category
        const opExCategories = [
            'Insurance', 'Repairs', 'Maintenance', 'Tires', 'Permits', 'DOT', 'Accounting', 'Office', 'ELD', 'Rent', 'Depreciation'
        ];

        // Helper to sum expenses by strict or loose match
        const sumByCategory = (cat: string) => expenses
            .filter(e =>
                (e.expenseCategory === cat) ||
                (e.description?.toLowerCase().includes(cat.toLowerCase()))
            )
            .reduce((sum, e) => sum + (e.amount || 0), 0);

        const truckPayments = sumByCategory('Truck Payment') + sumByCategory('Lease');
        const insurance = sumByCategory('Insurance');
        const repairsMaint = sumByCategory('Repairs') + sumByCategory('Maintenance');
        const tires = sumByCategory('Tires');
        const permits = sumByCategory('Permits') + sumByCategory('Licensing');
        const dot = sumByCategory('DOT') + sumByCategory('Compliance');
        const accounting = sumByCategory('Accounting') + sumByCategory('Professional Fees');
        const office = sumByCategory('Office') + sumByCategory('Admin');
        const eld = sumByCategory('ELD') + sumByCategory('GPS') + sumByCategory('Communication');
        const parking = sumByCategory('Parking') + sumByCategory('Storage');

        // Calculate Total Operating Expenses
        // Note: We need to be careful not to double count if logic overlaps, 
        // but for now simple keyword matching is a good start.
        // Also excluding COGS items (Fuel, Tolls).

        const totalOpEx = truckPayments + insurance + repairsMaint + tires + permits + dot + accounting + office + eld + parking;

        // 4. Factoring & Financial
        const factoringFees = loads.reduce((sum, l) => sum + (l.factoringFee || 0), 0);
        const transactionFees = loads.reduce((sum, l) => sum + (l.transactionFee || 0), 0);
        const totalFinancial = factoringFees + transactionFees;

        const operatingProfit = grossProfit - totalOpEx - totalFinancial;
        const netProfit = operatingProfit; // +/- Other Income if any

        // KPIS
        const totalMiles = loads.reduce((sum, l) => sum + (l.miles || 0), 0);
        const rpm = totalMiles > 0 ? totalRevenue / totalMiles : 0;
        const cpm = totalMiles > 0 ? (totalCOGS + totalOpEx + totalFinancial) / totalMiles : 0;
        const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

        return {
            revenue: {
                linehaul: linehaulRevenue,
                total: totalRevenue
            },
            cogs: {
                fuel: fuelCost,
                driverWages,
                tolls,
                dispatchFees,
                total: totalCOGS
            },
            opex: {
                truckPayments,
                insurance,
                repairsMaint,
                tires,
                permits,
                dot,
                accounting,
                office,
                eld,
                parking,
                total: totalOpEx
            },
            financial: {
                factoring: factoringFees,
                transaction: transactionFees,
                total: totalFinancial
            },
            grossProfit,
            operatingProfit,
            netProfit,
            kpis: {
                totalMiles,
                rpm,
                cpm,
                profitMargin
            }
        };

    }, [loads, expenses, settlementSummary]);

    const formatCurrency = (val: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
    const formatPercent = (val: number) => `${val.toFixed(2)}%`;

    return (
        <div className="p-6 space-y-8 max-w-5xl mx-auto">
            <div className="flex flex-col gap-2">
                <Link href="/reports" className="flex items-center text-sm text-muted-foreground hover:text-foreground mb-2">
                    <ArrowLeft className="h-4 w-4 mr-1" /> Back to Reports
                </Link>
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">Profit & Loss Statement</h1>
                        <p className="text-muted-foreground">{drivers?.length || 0} Drivers • {loads?.length || 0} Loads</p>
                    </div>

                    <div className="flex items-center gap-2">
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button variant="outline" className="w-[240px] justify-start text-left font-normal">
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {dateRange?.from ? (
                                        dateRange.to ? (
                                            <>
                                                {format(dateRange.from, "LLL dd, y")} -{" "}
                                                {format(dateRange.to, "LLL dd, y")}
                                            </>
                                        ) : (
                                            format(dateRange.from, "LLL dd, y")
                                        )
                                    ) : (
                                        <span>Pick a date</span>
                                    )}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="end">
                                <Calendar
                                    initialFocus
                                    mode="range"
                                    defaultMonth={dateRange?.from}
                                    selected={dateRange}
                                    onSelect={setDateRange}
                                    numberOfMonths={2}
                                    captionLayout="dropdown"
                                    fromYear={2020}
                                    toYear={new Date().getFullYear() + 1}
                                />
                            </PopoverContent>
                        </Popover>
                    </div>
                </div>
            </div>

            {loading || !metrics ? (
                <div className="flex items-center justify-center p-24">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
            ) : (
                <div className="space-y-6">
                    {/* Summary Cards */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <Card>
                            <CardHeader className="p-4 pb-2">
                                <CardTitle className="text-sm font-medium text-muted-foreground">Gross Revenue</CardTitle>
                            </CardHeader>
                            <CardContent className="p-4 pt-0">
                                <div className="text-2xl font-bold">{formatCurrency(metrics.revenue.total)}</div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="p-4 pb-2">
                                <CardTitle className="text-sm font-medium text-muted-foreground">Net Profit</CardTitle>
                            </CardHeader>
                            <CardContent className="p-4 pt-0">
                                <div className={cn("text-2xl font-bold", metrics.netProfit >= 0 ? "text-green-600" : "text-red-600")}>
                                    {formatCurrency(metrics.netProfit)}
                                </div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="p-4 pb-2">
                                <CardTitle className="text-sm font-medium text-muted-foreground">Profit Margin</CardTitle>
                            </CardHeader>
                            <CardContent className="p-4 pt-0">
                                <div className="text-2xl font-bold">{formatPercent(metrics.kpis.profitMargin)}</div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="p-4 pb-2">
                                <CardTitle className="text-sm font-medium text-muted-foreground">Cost Per Mile</CardTitle>
                            </CardHeader>
                            <CardContent className="p-4 pt-0">
                                <div className="text-2xl font-bold">{formatCurrency(metrics.kpis.cpm)}</div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Detailed Layout */}
                    <Card className="overflow-hidden">
                        <div className="border-b bg-muted/40 p-4">
                            <h3 className="font-semibold">Income Statement Detail</h3>
                        </div>
                        <div className="p-0">
                            {/* Revenue Section */}
                            <div className="px-6 py-4">
                                <div className="flex justify-between items-center mb-2">
                                    <h4 className="font-bold uppercase text-sm tracking-wider text-muted-foreground">Gross Operating Revenue</h4>
                                    <span className="font-bold">{formatCurrency(metrics.revenue.total)}</span>
                                </div>
                                <div className="pl-4 space-y-1 text-sm text-muted-foreground">
                                    <div className="flex justify-between">
                                        <span>Linehaul Freight & Surcharges</span>
                                        <span>{formatCurrency(metrics.revenue.linehaul)}</span>
                                    </div>
                                    {/* Add more breakdown if data model supports it later */}
                                </div>
                            </div>

                            <div className="h-px bg-border mx-6" />

                            {/* COGS Section */}
                            <div className="px-6 py-4">
                                <div className="flex justify-between items-center mb-2">
                                    <h4 className="font-bold uppercase text-sm tracking-wider text-muted-foreground">Cost of Goods Sold</h4>
                                    <span className="font-bold text-red-600">-{formatCurrency(metrics.cogs.total)}</span>
                                </div>
                                <div className="pl-4 space-y-1 text-sm text-muted-foreground">
                                    <div className="flex justify-between">
                                        <span>Fuel</span>
                                        <span>{formatCurrency(metrics.cogs.fuel)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span>Driver Wages / Owner Pay</span>
                                        <span>{formatCurrency(metrics.cogs.driverWages)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span>Tolls & Scales</span>
                                        <span>{formatCurrency(metrics.cogs.tolls)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span>Dispatch Fees</span>
                                        <span>{formatCurrency(metrics.cogs.dispatchFees)}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-muted/20 px-6 py-3 border-y flex justify-between items-center">
                                <span className="font-bold text-sm">Gross Profit</span>
                                <span className="font-bold">{formatCurrency(metrics.grossProfit)}</span>
                            </div>

                            {/* OpEx Section */}
                            <div className="px-6 py-4">
                                <div className="flex justify-between items-center mb-2">
                                    <h4 className="font-bold uppercase text-sm tracking-wider text-muted-foreground">Operating Expenses</h4>
                                    <span className="font-bold text-red-600">-{formatCurrency(metrics.opex.total)}</span>
                                </div>
                                <div className="pl-4 space-y-1 text-sm text-muted-foreground">
                                    <div className="flex justify-between"><span>Truck Payments / Lease</span><span>{formatCurrency(metrics.opex.truckPayments)}</span></div>
                                    <div className="flex justify-between"><span>Insurance</span><span>{formatCurrency(metrics.opex.insurance)}</span></div>
                                    <div className="flex justify-between"><span>Repairs & Maintenance</span><span>{formatCurrency(metrics.opex.repairsMaint)}</span></div>
                                    <div className="flex justify-between"><span>Tires</span><span>{formatCurrency(metrics.opex.tires)}</span></div>
                                    <div className="flex justify-between"><span>Permits & Licensing</span><span>{formatCurrency(metrics.opex.permits)}</span></div>
                                    <div className="flex justify-between"><span>DOT & Compliance</span><span>{formatCurrency(metrics.opex.dot)}</span></div>
                                    <div className="flex justify-between"><span>Accounting & Professional</span><span>{formatCurrency(metrics.opex.accounting)}</span></div>
                                    <div className="flex justify-between"><span>Office & Admin</span><span>{formatCurrency(metrics.opex.office)}</span></div>
                                    <div className="flex justify-between"><span>ELD & Communication</span><span>{formatCurrency(metrics.opex.eld)}</span></div>
                                    <div className="flex justify-between"><span>Parking & Storage</span><span>{formatCurrency(metrics.opex.parking)}</span></div>
                                </div>
                            </div>

                            <div className="h-px bg-border mx-6" />

                            {/* Financial Section */}
                            <div className="px-6 py-4">
                                <div className="flex justify-between items-center mb-2">
                                    <h4 className="font-bold uppercase text-sm tracking-wider text-muted-foreground">Factoring & Financial</h4>
                                    <span className="font-bold text-red-600">-{formatCurrency(metrics.financial.total)}</span>
                                </div>
                                <div className="pl-4 space-y-1 text-sm text-muted-foreground">
                                    <div className="flex justify-between">
                                        <span>Factoring Fees</span>
                                        <span>{formatCurrency(metrics.financial.factoring)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span>Wire / Transaction Fees</span>
                                        <span>{formatCurrency(metrics.financial.transaction)}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Net Profit Section */}
                            <div className="bg-primary/5 px-6 py-4 border-t flex justify-between items-center">
                                <span className="font-bold text-lg">Net Profit (Net Income)</span>
                                <span className={cn("font-bold text-lg", metrics.netProfit >= 0 ? "text-green-700" : "text-red-700")}>
                                    {formatCurrency(metrics.netProfit)}
                                </span>
                            </div>
                        </div>
                    </Card>
                </div>
            )}
        </div>
    );
}
