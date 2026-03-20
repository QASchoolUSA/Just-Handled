"use client";

import { useState, useMemo } from "react";
import { format, subMonths, startOfDay, endOfDay } from "date-fns";
import { Calendar as CalendarIcon, FileDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    ChartContainer,
    ChartTooltip,
    ChartTooltipContent,
    type ChartConfig,
} from "@/components/ui/chart";
import { Bar, BarChart, XAxis, YAxis, Cell } from "recharts";
import { useCollection, useFirestore, useMemoFirebase } from "@/firebase";
import { useCompany } from "@/firebase/provider";
import { collection, query, where } from "firebase/firestore";
import type { Load, Expense, Driver, Owner } from "@/lib/types";
import { useSettlementCalculations } from "@/hooks/use-settlement-calculations";
import { DateRange } from "react-day-picker";
import { computeProfitLossMetrics } from "@/lib/financial/compute-profit-loss";
import { exportProfitLossPdf } from "@/lib/exports/statement-pdf-exports";

export default function ProfitLossPage() {
    const firestore = useFirestore();
    const { companyId, companyName } = useCompany();

    const [dateRange, setDateRange] = useState<DateRange | undefined>({
        from: startOfDay(subMonths(new Date(), 1)),
        to: endOfDay(new Date())
    });
    const [activePreset, setActivePreset] = useState<string>("1M");

    // --- Presets ---
    const presets = [
        { label: "1 Month", value: "1M", months: 1 },
        { label: "3 Months", value: "3M", months: 3 },
        { label: "6 Months", value: "6M", months: 6 },
        { label: "12 Months", value: "12M", months: 12 },
    ];

    const handlePresetClick = (months: number, label: string) => {
        const to = new Date();
        const from = subMonths(to, months);
        setDateRange({ from: startOfDay(from), to: endOfDay(to) });
        setActivePreset(label);
    };

    // --- Data Fetching ---
    const fromStr = dateRange?.from ? format(dateRange.from, 'yyyy-MM-dd') : '';
    const toStr = dateRange?.to ? format(dateRange.to, 'yyyy-MM-dd') : '';

    const loadsQuery = useMemoFirebase(() => {
        if (!firestore || !companyId) return null;
        if (fromStr && toStr) {
            return query(
                collection(firestore, `companies/${companyId}/loads`),
                where('deliveryDate', '>=', fromStr),
                where('deliveryDate', '<=', toStr)
            );
        }
        return collection(firestore, `companies/${companyId}/loads`);
    }, [firestore, companyId, fromStr, toStr]);

    const expensesQuery = useMemoFirebase(() => {
        if (!firestore || !companyId) return null;
        if (fromStr && toStr) {
            return query(
                collection(firestore, `companies/${companyId}/expenses`),
                where('date', '>=', fromStr),
                where('date', '<=', toStr + 'T23:59:59.999Z')
            );
        }
        return collection(firestore, `companies/${companyId}/expenses`);
    }, [firestore, companyId, fromStr, toStr]);

    const driversQuery = useMemoFirebase(() => firestore && companyId ? collection(firestore, `companies/${companyId}/drivers`) : null, [firestore, companyId]);
    const ownersQuery = useMemoFirebase(() => firestore && companyId ? collection(firestore, `companies/${companyId}/owners`) : null, [firestore, companyId]);

    const { data: loads, loading: loadsLoading } = useCollection<Load>(loadsQuery);
    const { data: expenses, loading: expensesLoading } = useCollection<Expense>(expensesQuery);
    const { data: drivers, loading: driversLoading } = useCollection<Driver>(driversQuery);
    const { data: owners, loading: ownersLoading } = useCollection<Owner>(ownersQuery);

    const loading = loadsLoading || expensesLoading || driversLoading || ownersLoading;

    // --- Client-Side Filtering ---
    const filteredLoads = useMemo(() => {
        if (!loads) return [];
        if (!fromStr || !toStr) return loads;
        return loads.filter(l => l.deliveryDate >= fromStr && l.deliveryDate <= toStr);
    }, [loads, fromStr, toStr]);

    const filteredExpenses = useMemo(() => {
        if (!expenses) return [];
        if (!fromStr || !toStr) return expenses;
        return expenses.filter(e => e.date >= fromStr && e.date <= toStr);
    }, [expenses, fromStr, toStr]);

    // --- Calculations ---
    const driverMap = useMemo(() => new Map(drivers?.map((d) => [d.id, d])), [drivers]);

    // Use settlement calculations to get accurate driver pay
    const { settlementSummary } = useSettlementCalculations(
        drivers || [],
        filteredLoads,
        filteredExpenses,
        owners || [],
        dateRange?.from || new Date(),
        dateRange?.to || new Date(),
        driverMap
    );

    const metrics = useMemo(() => {
        if (!filteredLoads || !filteredExpenses || !settlementSummary) return null;
        return computeProfitLossMetrics({
            loads: filteredLoads,
            expenses: filteredExpenses,
            settlementSummary,
        });
    }, [filteredLoads, filteredExpenses, settlementSummary]);

    const formatCurrency = (val: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
    const formatPercent = (val: number) => `${val.toFixed(2)}%`;
    const handleExportPdf = () => {
        if (!metrics || !dateRange?.from || !dateRange?.to) return;
        exportProfitLossPdf({
            companyName,
            from: dateRange.from,
            to: dateRange.to,
            metrics,
        });
    };

    return (
        <div className="p-6 space-y-8 max-w-5xl mx-auto">
            <div className="flex flex-col gap-2">
                {/* Remove Back to Reports Link */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">Profit & Loss Statement</h1>
                        <p className="text-muted-foreground">{drivers?.length || 0} Drivers • {filteredLoads.length} Loads</p>
                    </div>
                    <Button variant="outline" size="sm" onClick={handleExportPdf} disabled={!metrics || !dateRange?.from || !dateRange?.to}>
                        <FileDown className="mr-2 h-4 w-4" />
                        Export PDF
                    </Button>

                    <div className="flex items-center gap-2 bg-muted/20 p-1 rounded-lg border">
                        {presets.map(preset => (
                            <Button
                                key={preset.value}
                                variant={activePreset === preset.value ? "secondary" : "ghost"}
                                size="sm"
                                onClick={() => handlePresetClick(preset.months, preset.value)}
                                className={cn(activePreset === preset.value && "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90")}
                            >
                                {preset.label}
                            </Button>
                        ))}
                        <div className="w-[1px] h-6 bg-border mx-1" />

                        <div className="flex items-center gap-2">
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant={activePreset === "custom" ? "secondary" : "ghost"}
                                        size="sm"
                                        className={cn(
                                            "w-[140px] justify-start text-left font-normal",
                                            activePreset === "custom" && "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90"
                                        )}
                                    >
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {dateRange?.from ? format(dateRange.from, "LLL dd, y") : <span>From</span>}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                    <Calendar
                                        mode="single"
                                        selected={dateRange?.from}
                                        onSelect={(date) => {
                                            setDateRange(prev => ({ from: date, to: prev?.to }));
                                            setActivePreset("custom");
                                        }}
                                        initialFocus
                                        captionLayout="dropdown"
                                        fromYear={2020}
                                        toYear={new Date().getFullYear() + 5}
                                    />
                                </PopoverContent>
                            </Popover>

                            <span className="text-muted-foreground text-sm">to</span>

                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant={activePreset === "custom" ? "secondary" : "ghost"}
                                        size="sm"
                                        className={cn(
                                            "w-[140px] justify-start text-left font-normal",
                                            activePreset === "custom" && "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90"
                                        )}
                                    >
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {dateRange?.to ? format(dateRange.to, "LLL dd, y") : <span>To</span>}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                    <Calendar
                                        mode="single"
                                        selected={dateRange?.to}
                                        onSelect={(date) => {
                                            setDateRange(prev => ({ from: prev?.from, to: date }));
                                            setActivePreset("custom");
                                        }}
                                        initialFocus
                                        captionLayout="dropdown"
                                        fromYear={2020}
                                        toYear={new Date().getFullYear() + 5}
                                        disabled={(date) => dateRange?.from ? date < startOfDay(dateRange.from) : false}
                                    />
                                </PopoverContent>
                            </Popover>
                        </div>
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

                    {/* P&L Composition Chart */}
                    <div className="grid gap-6 md:grid-cols-2">
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium text-muted-foreground">P&L composition</CardTitle>
                            </CardHeader>
                            <CardContent>
                                {(() => {
                                    const compositionData = [
                                        { name: "Revenue", value: metrics.revenue.total, fill: "hsl(var(--chart-1))" },
                                        { name: "COGS", value: -metrics.cogs.total, fill: "hsl(var(--chart-2))" },
                                        { name: "Opex", value: -metrics.opex.total, fill: "hsl(var(--chart-3))" },
                                        { name: "Financial", value: -metrics.financial.total, fill: "hsl(var(--chart-4))" },
                                        { name: "Net Profit", value: metrics.netProfit, fill: metrics.netProfit >= 0 ? "hsl(var(--chart-1))" : "hsl(var(--destructive))" },
                                    ].filter((d) => d.value !== 0);
                                    const plConfig = { name: { label: "Category" }, value: { label: "Amount", color: "hsl(var(--chart-1))" } } satisfies ChartConfig;
                                    return (
                                        <ChartContainer config={plConfig} className="h-[260px] w-full">
                                            <BarChart data={compositionData} layout="vertical" margin={{ left: 12, right: 12 }}>
                                                <XAxis type="number" tickFormatter={(v: unknown) => `$${Number(v) >= 0 ? "" : "-"}${Math.abs(Number(v)) >= 1000 ? `${(Math.abs(Number(v)) / 1000).toFixed(1)}k` : Math.abs(Number(v))}`} />
                                                <YAxis type="category" dataKey="name" width={80} tickLine={false} axisLine={false} />
                                                <ChartTooltip cursor={false} content={<ChartTooltipContent formatter={(v) => formatCurrency(Number(v))} />} />
                                                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                                                    {compositionData.map((entry, index) => (
                                                        <Cell key={entry.name} fill={entry.fill} />
                                                    ))}
                                                </Bar>
                                            </BarChart>
                                        </ChartContainer>
                                    );
                                })()}
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium text-muted-foreground">Expense by category</CardTitle>
                            </CardHeader>
                            <CardContent>
                                {(() => {
                                    const expenseCategories = [
                                        { name: "Driver Wages", value: metrics.cogs.driverWages },
                                        { name: "Fuel", value: metrics.cogs.fuel },
                                        { name: "Factoring", value: metrics.financial.factoring },
                                        { name: "Truck / Lease", value: metrics.opex.truckPayments },
                                        { name: "Insurance", value: metrics.opex.insurance },
                                        { name: "Repairs & Maint", value: metrics.opex.repairsMaint },
                                        { name: "Tolls", value: metrics.cogs.tolls },
                                        { name: "Tires", value: metrics.opex.tires },
                                        { name: "Permits", value: metrics.opex.permits },
                                        { name: "Other Opex", value: metrics.opex.dot + metrics.opex.accounting + metrics.opex.office + metrics.opex.eld + metrics.opex.parking },
                                        { name: "Transaction Fees", value: metrics.financial.transaction },
                                        { name: "Dispatch", value: metrics.cogs.dispatchFees },
                                    ].filter((d) => d.value > 0).sort((a, b) => b.value - a.value);
                                    const expConfig = { name: { label: "Category" }, value: { label: "Amount", color: "hsl(var(--chart-2))" } } satisfies ChartConfig;
                                    return (
                                        <ChartContainer config={expConfig} className="h-[260px] w-full">
                                            <BarChart data={expenseCategories} margin={{ left: 12, right: 12 }}>
                                                <XAxis dataKey="name" tickLine={false} axisLine={false} angle={-35} textAnchor="end" height={70} />
                                                <YAxis tickFormatter={(v: unknown) => `$${Number(v) >= 1000 ? `${(Number(v) / 1000).toFixed(0)}k` : Number(v)}`} tickLine={false} axisLine={false} width={50} />
                                                <ChartTooltip cursor={false} content={<ChartTooltipContent formatter={(v) => formatCurrency(Number(v))} />} />
                                                <Bar dataKey="value" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
                                            </BarChart>
                                        </ChartContainer>
                                    );
                                })()}
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
