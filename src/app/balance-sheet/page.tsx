"use client";

import { useMemo, useState } from "react";
import { format, subMonths, startOfDay, endOfDay } from "date-fns";
import { Calendar as CalendarIcon, Loader2 } from "lucide-react";
import { collection, query, where } from "firebase/firestore";
import type { DateRange } from "react-day-picker";

import { cn } from "@/lib/utils";
import type { Driver, Expense, Load, Owner } from "@/lib/types";
import { useSettlementCalculations } from "@/hooks/use-settlement-calculations";
import { useCollection, useFirestore, useMemoFirebase } from "@/firebase";
import { useCompany } from "@/firebase/provider";
import { computeProfitLossMetrics } from "@/lib/financial/compute-profit-loss";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type Line = {
  key: string;
  label: string;
  value?: number | null;
  isSubtotal?: boolean;
  isTotal?: boolean;
  isEmphasis?: boolean;
  isNegative?: boolean;
};

function formatCurrency(val: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(val);
}

function BalanceRow({ line }: { line: Line }) {
  const display = typeof line.value === "number" ? formatCurrency(line.value) : "—";

  return (
    <div
      className={cn(
        "grid grid-cols-[1fr_auto] items-baseline gap-6 py-1 text-sm",
        (line.isSubtotal || line.isTotal) && "pt-2",
        line.isTotal && "border-t border-border/60 mt-2",
        line.isEmphasis && "text-base font-semibold",
        line.isSubtotal && "font-medium",
        line.isNegative && typeof line.value === "number" && line.value < 0 && "text-red-600"
      )}
    >
      <div className="min-w-0">
        <div className="flex items-baseline gap-3">
          <span className={cn("truncate", (line.isSubtotal || line.isTotal) && "uppercase tracking-wide text-muted-foreground")}>
            {line.label}
          </span>
          <div className="flex-1 border-b border-dotted border-border/50 translate-y-[-2px]" />
        </div>
      </div>
      <div className={cn("tabular-nums", line.isEmphasis && "text-foreground")}>{display}</div>
    </div>
  );
}

export default function BalanceSheetPage() {
  const firestore = useFirestore();
  const { companyId, companyName } = useCompany();

  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: startOfDay(subMonths(new Date(), 1)),
    to: endOfDay(new Date()),
  });
  const [activePreset, setActivePreset] = useState<string>("1M");

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

  const fromStr = dateRange?.from ? format(dateRange.from, "yyyy-MM-dd") : "";
  const toStr = dateRange?.to ? format(dateRange.to, "yyyy-MM-dd") : "";

  const loadsQuery = useMemoFirebase(() => {
    if (!firestore || !companyId) return null;
    if (fromStr && toStr) {
      return query(
        collection(firestore, `companies/${companyId}/loads`),
        where("deliveryDate", ">=", fromStr),
        where("deliveryDate", "<=", toStr)
      );
    }
    return collection(firestore, `companies/${companyId}/loads`);
  }, [firestore, companyId, fromStr, toStr]);

  const expensesQuery = useMemoFirebase(() => {
    if (!firestore || !companyId) return null;
    if (fromStr && toStr) {
      return query(
        collection(firestore, `companies/${companyId}/expenses`),
        where("date", ">=", fromStr),
        where("date", "<=", toStr + "T23:59:59.999Z")
      );
    }
    return collection(firestore, `companies/${companyId}/expenses`);
  }, [firestore, companyId, fromStr, toStr]);

  const driversQuery = useMemoFirebase(
    () => (firestore && companyId ? collection(firestore, `companies/${companyId}/drivers`) : null),
    [firestore, companyId]
  );
  const ownersQuery = useMemoFirebase(
    () => (firestore && companyId ? collection(firestore, `companies/${companyId}/owners`) : null),
    [firestore, companyId]
  );

  const { data: loads, loading: loadsLoading } = useCollection<Load>(loadsQuery);
  const { data: expenses, loading: expensesLoading } = useCollection<Expense>(expensesQuery);
  const { data: drivers, loading: driversLoading } = useCollection<Driver>(driversQuery);
  const { data: owners, loading: ownersLoading } = useCollection<Owner>(ownersQuery);

  const loading = loadsLoading || expensesLoading || driversLoading || ownersLoading;

  const filteredLoads = useMemo(() => {
    if (!loads) return [];
    if (!fromStr || !toStr) return loads;
    return loads.filter((l) => l.deliveryDate >= fromStr && l.deliveryDate <= toStr);
  }, [loads, fromStr, toStr]);

  const filteredExpenses = useMemo(() => {
    if (!expenses) return [];
    if (!fromStr || !toStr) return expenses;
    return expenses.filter((e) => e.date >= fromStr && e.date <= toStr);
  }, [expenses, fromStr, toStr]);

  const driverMap = useMemo(() => new Map(drivers?.map((d) => [d.id, d])), [drivers]);

  const { settlementSummary } = useSettlementCalculations(
    drivers || [],
    filteredLoads,
    filteredExpenses,
    owners || [],
    dateRange?.from || new Date(),
    dateRange?.to || new Date(),
    driverMap
  );

  const netProfit = useMemo(() => {
    if (!filteredLoads || !filteredExpenses || !settlementSummary) return null;
    return computeProfitLossMetrics({
      loads: filteredLoads,
      expenses: filteredExpenses,
      settlementSummary,
    }).netProfit;
  }, [filteredLoads, filteredExpenses, settlementSummary]);

  const asOfLabel = dateRange?.to ? format(dateRange.to, "MMMM dd, yyyy") : "—";

  const equityLines: Line[] = [
    { key: "ownersCapital", label: "Owner’s Capital / Paid-In Capital", value: null },
    { key: "retainedEarnings", label: "Retained Earnings", value: null },
    {
      key: "currentPeriodNetIncome",
      label: "Current Period Net Income",
      value: typeof netProfit === "number" ? netProfit : null,
      isEmphasis: true,
      isNegative: true,
    },
    { key: "totalEquity", label: "Total Equity", value: null, isTotal: true },
  ];

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex flex-col gap-2">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Balance Sheet</h1>
            <p className="text-muted-foreground">
              Trucking Company • With Factoring • As of {asOfLabel}
            </p>
          </div>

          <div className="flex items-center gap-2 bg-muted/20 p-1 rounded-lg border">
            {presets.map((preset) => (
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
                      "w-[160px] justify-start text-left font-normal",
                      activePreset === "custom" && "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateRange?.to ? format(dateRange.to, "LLL dd, y") : <span>As of</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dateRange?.to}
                    onSelect={(date) => {
                      setDateRange((prev) => ({ from: prev?.from, to: date }));
                      setActivePreset("custom");
                    }}
                    initialFocus
                    captionLayout="dropdown"
                    fromYear={2020}
                    toYear={new Date().getFullYear() + 5}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </div>
      </div>

      {loading || netProfit === null ? (
        <div className="flex items-center justify-center p-24">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <Card className="overflow-hidden">
          <CardHeader className="border-b bg-muted/30">
            <CardTitle className="text-base">
              {companyName || "Company"} — Balance Sheet (With Factoring)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-8">
            <div className="grid md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Assets</div>
                  <div className="mt-3 space-y-4">
                    <div>
                      <div className="text-sm font-semibold">Current Assets</div>
                      <p className="text-xs text-muted-foreground mt-0.5">Cash or things that become cash within ~12 months</p>
                      <div className="mt-2 space-y-1">
                        <BalanceRow line={{ key: "cash", label: "Cash", value: null }} />
                        <BalanceRow line={{ key: "arUnfactored", label: "Accounts Receivable (Unfactored)", value: null }} />
                        <BalanceRow line={{ key: "factoredReceivables", label: "Factored Receivables", value: null }} />
                        <BalanceRow line={{ key: "factoredReserve", label: "Factored Receivables (Reserve)", value: null }} />
                        <BalanceRow line={{ key: "fuelAdvances", label: "Fuel Advances", value: null }} />
                        <BalanceRow line={{ key: "prepaid", label: "Prepaid Expenses", value: null }} />
                        <BalanceRow line={{ key: "totalCurrentAssets", label: "Total Current Assets", value: null, isSubtotal: true }} />
                      </div>
                    </div>

                    <div>
                      <div className="text-sm font-semibold">Property &amp; Equipment</div>
                      <p className="text-xs text-muted-foreground mt-0.5">Your trucking equipment</p>
                      <div className="mt-2 space-y-1">
                        <BalanceRow line={{ key: "trucks", label: "Trucks", value: null }} />
                        <BalanceRow line={{ key: "trailers", label: "Trailers", value: null }} />
                        <BalanceRow line={{ key: "otherEquipment", label: "Other Equipment", value: null }} />
                        <BalanceRow line={{ key: "ppeCost", label: "Total Property & Equipment (Cost)", value: null, isSubtotal: true }} />
                        <BalanceRow line={{ key: "accumDep", label: "Less: Accumulated Depreciation", value: null }} />
                        <BalanceRow line={{ key: "netPpe", label: "Net Property & Equipment", value: null, isSubtotal: true }} />
                      </div>
                    </div>

                    <div>
                      <div className="text-sm font-semibold">Other Assets</div>
                      <div className="mt-2 space-y-1">
                        <BalanceRow line={{ key: "securityDeposits", label: "Security Deposits", value: null }} />
                        <BalanceRow line={{ key: "iftaCredits", label: "IFTA Credits / Refunds Receivable", value: null }} />
                        <BalanceRow line={{ key: "totalOtherAssets", label: "Total Other Assets", value: null, isSubtotal: true }} />
                      </div>
                    </div>

                    <div className="pt-2">
                      <BalanceRow line={{ key: "totalAssets", label: "Total Assets", value: null, isTotal: true }} />
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Liabilities and Equity
                  </div>
                  <div className="mt-3 space-y-4">
                    <div>
                      <div className="text-sm font-semibold">Current Liabilities</div>
                      <p className="text-xs text-muted-foreground mt-0.5">Due within 12 months</p>
                      <div className="mt-2 space-y-1">
                        <BalanceRow line={{ key: "ap", label: "Accounts Payable", value: null }} />
                        <BalanceRow line={{ key: "creditCards", label: "Credit Cards", value: null }} />
                        <BalanceRow line={{ key: "accrued", label: "Accrued Expenses", value: null }} />
                        <BalanceRow line={{ key: "payrollTaxes", label: "Payroll & Payroll Taxes Payable", value: null }} />
                        <BalanceRow line={{ key: "fuelCards", label: "Fuel Cards Payable", value: null }} />
                        <BalanceRow line={{ key: "factoringAdvance", label: "Factoring Advance Liability", value: null }} />
                        <BalanceRow line={{ key: "totalCurrentLiab", label: "Total Current Liabilities", value: null, isSubtotal: true }} />
                      </div>
                    </div>

                    <div>
                      <div className="text-sm font-semibold">Long-Term Liabilities</div>
                      <div className="mt-2 space-y-1">
                        <BalanceRow line={{ key: "truckLoans", label: "Truck Loans / Leases Payable", value: null }} />
                        <BalanceRow line={{ key: "otherLTDebt", label: "Other Long-Term Debt", value: null }} />
                        <BalanceRow line={{ key: "totalLongTermLiab", label: "Total Long-Term Liabilities", value: null, isSubtotal: true }} />
                      </div>
                    </div>

                    <div className="pt-1">
                      <BalanceRow line={{ key: "totalLiabilities", label: "Total Liabilities", value: null, isTotal: true }} />
                    </div>

                    <div>
                      <div className="text-sm font-semibold">Equity</div>
                      <p className="text-xs text-muted-foreground mt-0.5">Owner’s value in the business</p>
                      <div className="mt-2 space-y-1">
                        {equityLines.map((line) => (
                          <BalanceRow key={line.key} line={line} />
                        ))}
                      </div>
                    </div>

                    <div className="pt-2">
                      <BalanceRow line={{ key: "totalLiabEquity", label: "Total Liabilities & Equity", value: null, isTotal: true }} />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-xs text-muted-foreground">
              <strong className="text-foreground">Balance sheet rule:</strong> Total Assets = Total Liabilities + Equity.
              Only <span className="font-medium text-foreground">Current Period Net Income</span> is calculated from loads and expenses; other line items are placeholders for manual or future data entry.
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

