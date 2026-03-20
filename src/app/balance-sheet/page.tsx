"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { format, subMonths, startOfDay, endOfDay } from "date-fns";
import { Calendar as CalendarIcon, FileDown, Loader2 } from "lucide-react";
import { collection, query, where, doc, getDoc } from "firebase/firestore";
import type { DateRange } from "react-day-picker";

import { cn } from "@/lib/utils";
import type { Driver, Expense, Load, Owner } from "@/lib/types";
import { useSettlementCalculations } from "@/hooks/use-settlement-calculations";
import { useCollection, useFirestore, useMemoFirebase } from "@/firebase";
import { useCompany } from "@/firebase/provider";
import { computeProfitLossMetrics } from "@/lib/financial/compute-profit-loss";
import type { BalanceSheetSnapshot } from "@/lib/balance-sheet/balance-sheet-types";
import { computeBalancedRetainedEarnings, computeBalanceSheet } from "@/lib/balance-sheet/compute-balance-sheet";
import { EMPTY_BALANCE_SHEET_SNAPSHOT } from "@/lib/balance-sheet/balance-sheet-types";
import type { ParsedFile } from "@/lib/onboarding/types";
import { parseUploadedFile } from "@/lib/onboarding/parse-file";
import { getMappedCell, type ColumnMapping } from "@/lib/import-mapping";
import { ImportWithMappingDialog } from "@/components/import-with-mapping-dialog";
import { BALANCE_SHEET_IMPORT_CONFIG } from "@/lib/import-configs";
import { exportBalanceSheetPdf } from "@/lib/exports/statement-pdf-exports";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { serverTimestamp, setDoc } from "firebase/firestore";
import { Upload } from "lucide-react";

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

  const asOfDate = useMemo(() => {
    if (!dateRange?.to) return null;
    return format(dateRange.to, "yyyy-MM-dd");
  }, [dateRange?.to]);

  const [balanceSnapshot, setBalanceSnapshot] = useState<BalanceSheetSnapshot | null>(null);
  const [snapshotLoadError, setSnapshotLoadError] = useState<string | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const { toast } = useToast();
  const [isSavingSnapshot, setIsSavingSnapshot] = useState(false);
  const [draftSnapshot, setDraftSnapshot] = useState<BalanceSheetSnapshot>(EMPTY_BALANCE_SHEET_SNAPSHOT);

  const [balanceImportParsed, setBalanceImportParsed] = useState<ParsedFile | null>(null);
  const [balanceMappingDialogOpen, setBalanceMappingDialogOpen] = useState(false);
  const [isImportingBalance, setIsImportingBalance] = useState(false);
  const balanceFileInputRef = useRef<HTMLInputElement>(null);

  const openEditDialog = () => {
    setDraftSnapshot(balanceSnapshot ? { ...balanceSnapshot } : { ...EMPTY_BALANCE_SHEET_SNAPSHOT });
    setIsEditOpen(true);
  };

  const handleBalanceImportClick = () => {
    balanceFileInputRef.current?.click();
  };

  const handleBalanceFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setIsImportingBalance(true);
      const parsed = await parseUploadedFile(file);
      if (parsed.rows.length === 0) {
        toast({ title: "No rows found", description: "The uploaded file has no data rows.", variant: "destructive" });
        return;
      }
      setBalanceImportParsed(parsed);
      setBalanceMappingDialogOpen(true);
    } catch (err: any) {
      toast({
        title: "Import failed",
        description: err?.message || "Unable to parse the file.",
        variant: "destructive",
      });
    } finally {
      setIsImportingBalance(false);
      if (balanceFileInputRef.current) balanceFileInputRef.current.value = "";
    }
  };

  const runBalanceSheetImportWithMapping = async (mapping: ColumnMapping): Promise<boolean> => {
    if (!firestore || !companyId || !asOfDate || !balanceImportParsed || typeof netProfit !== "number") return false;
    const { headers, rows } = balanceImportParsed;

    // We expect the file to contain a single snapshot row; if multiple rows exist, import the first one.
    const row = rows[0] as Record<string, unknown>;

    const num = (v: unknown) => {
      if (v == null || v === "") return 0;
      if (typeof v === "number") return Number.isFinite(v) ? v : 0;
      const cleaned = String(v).replace(/[$,\\s]/g, "").trim();
      const n = parseFloat(cleaned);
      return Number.isFinite(n) ? n : 0;
    };

    const nextSnapshot: BalanceSheetSnapshot = {
      ...EMPTY_BALANCE_SHEET_SNAPSHOT,
      // Assets
      cash: num(getMappedCell(row, "cash", mapping, headers)),
      arUnfactored: num(getMappedCell(row, "arUnfactored", mapping, headers)),
      factoredReceivables: num(getMappedCell(row, "factoredReceivables", mapping, headers)),
      factoredReserve: num(getMappedCell(row, "factoredReserve", mapping, headers)),
      fuelAdvances: num(getMappedCell(row, "fuelAdvances", mapping, headers)),
      prepaid: num(getMappedCell(row, "prepaid", mapping, headers)),
      trucks: num(getMappedCell(row, "trucks", mapping, headers)),
      trailers: num(getMappedCell(row, "trailers", mapping, headers)),
      otherEquipment: num(getMappedCell(row, "otherEquipment", mapping, headers)),
      accumDep: num(getMappedCell(row, "accumDep", mapping, headers)),
      securityDeposits: num(getMappedCell(row, "securityDeposits", mapping, headers)),
      iftaCredits: num(getMappedCell(row, "iftaCredits", mapping, headers)),
      // Liabilities
      ap: num(getMappedCell(row, "ap", mapping, headers)),
      creditCards: num(getMappedCell(row, "creditCards", mapping, headers)),
      accrued: num(getMappedCell(row, "accrued", mapping, headers)),
      payrollTaxes: num(getMappedCell(row, "payrollTaxes", mapping, headers)),
      fuelCards: num(getMappedCell(row, "fuelCards", mapping, headers)),
      factoringAdvance: num(getMappedCell(row, "factoringAdvance", mapping, headers)),
      truckLoans: num(getMappedCell(row, "truckLoans", mapping, headers)),
      otherLTDebt: num(getMappedCell(row, "otherLTDebt", mapping, headers)),
      // Equity
      ownersCapital: num(getMappedCell(row, "ownersCapital", mapping, headers)),
      retainedEarnings: num(getMappedCell(row, "retainedEarnings", mapping, headers)),
    };

    // Enforce equation automatically for imports too.
    const balancedRetained = computeBalancedRetainedEarnings({
      snapshot: nextSnapshot,
      currentPeriodNetIncome: netProfit,
    });

    nextSnapshot.retainedEarnings = balancedRetained;

    const snapRef = doc(firestore, `companies/${companyId}/balanceSheetSnapshots/${asOfDate}`);
    await setDoc(
      snapRef,
      {
        ...nextSnapshot,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    setBalanceSnapshot(nextSnapshot);
    return true;
  };

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

  // Load persisted snapshot for this "as-of" date.
  useEffect(() => {
    if (!firestore || !companyId || !asOfDate) {
      setBalanceSnapshot(null);
      setSnapshotLoadError(null);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        setSnapshotLoadError(null);
        const snapRef = doc(firestore, `companies/${companyId}/balanceSheetSnapshots/${asOfDate}`);
        const snap = await getDoc(snapRef);
        if (cancelled) return;

        if (!snap.exists()) {
          setBalanceSnapshot(null);
          return;
        }

        const data = snap.data() as Partial<BalanceSheetSnapshot> | undefined;
        setBalanceSnapshot({
          ...EMPTY_BALANCE_SHEET_SNAPSHOT,
          ...(data || {}),
        } as BalanceSheetSnapshot);
      } catch (err: any) {
        if (cancelled) return;
        setSnapshotLoadError(err?.message || "Failed to load balance sheet data.");
        setBalanceSnapshot(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [firestore, companyId, asOfDate]);

  const computed = useMemo(() => {
    if (!balanceSnapshot || netProfit === null) return null;
    return computeBalanceSheet(balanceSnapshot, netProfit);
  }, [balanceSnapshot, netProfit]);

  const equityLines: Line[] = [
    {
      key: "ownersCapital",
      label: "Owner’s Capital / Paid-In Capital",
      value: computed ? computed.ownersCapital : null,
    },
    {
      key: "retainedEarnings",
      label: "Retained Earnings",
      value: computed ? computed.retainedEarnings : null,
    },
    {
      key: "currentPeriodNetIncome",
      label: "Current Period Net Income",
      value: typeof netProfit === "number" ? netProfit : null,
      isEmphasis: true,
      isNegative: true,
    },
    { key: "totalEquity", label: "Total Equity", value: computed ? computed.totalEquity : null, isTotal: true },
  ];
  const handleExportPdf = () => {
    if (!computed || !dateRange?.to) return;
    exportBalanceSheetPdf({
      companyName,
      asOf: dateRange.to,
      computed,
    });
  };

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
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-base">
                {companyName || "Company"} — Balance Sheet (With Factoring)
              </CardTitle>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleExportPdf} disabled={!computed || !dateRange?.to}>
                  <FileDown className="mr-2 h-4 w-4" />
                  Export PDF
                </Button>
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  className="hidden"
                  ref={balanceFileInputRef}
                  onChange={handleBalanceFileChange}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleBalanceImportClick}
                  disabled={isImportingBalance}
                >
                  <Upload className="mr-2 h-4 w-4" />
                  Import
                </Button>
                <Button variant="outline" size="sm" onClick={openEditDialog}>
                  Edit Balance Sheet Data
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-6 space-y-8">
            {snapshotLoadError && (
              <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-center justify-between gap-3">
                <span>{snapshotLoadError}</span>
              </div>
            )}

            <div className="space-y-3">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Balance Sheet Calculators</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="border-border/50">
                  <CardContent className="p-4 pt-3">
                    <div className="text-sm font-medium text-muted-foreground">Net Worth</div>
                    <div className="mt-2 text-2xl font-bold">{computed ? formatCurrency(computed.netWorth) : "—"}</div>
                    <div className="mt-1 text-xs text-muted-foreground">Assets − Liabilities</div>
                  </CardContent>
                </Card>

                <Card className="border-border/50">
                  <CardContent className="p-4 pt-3">
                    <div className="text-sm font-medium text-muted-foreground">Debt-to-Equity</div>
                    <div className="mt-2 text-2xl font-bold">
                      {computed && computed.debtToEquity != null ? computed.debtToEquity.toFixed(2) : "—"}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">Debt / Equity</div>
                  </CardContent>
                </Card>

                <Card className="border-border/50">
                  <CardContent className="p-4 pt-3">
                    <div className="text-sm font-medium text-muted-foreground">Working Capital</div>
                    <div className="mt-2 text-2xl font-bold">{computed ? formatCurrency(computed.workingCapital) : "—"}</div>
                    <div className="mt-1 text-xs text-muted-foreground">Current Assets − Current Liabilities</div>
                  </CardContent>
                </Card>

                <Card className="border-border/50">
                  <CardContent className="p-4 pt-3">
                    <div className="text-sm font-medium text-muted-foreground">Current Ratio</div>
                    <div className="mt-2 text-2xl font-bold">
                      {computed && computed.currentRatio != null ? computed.currentRatio.toFixed(2) : "—"}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">Current Assets / Current Liabilities</div>
                  </CardContent>
                </Card>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Assets</div>
                  <div className="mt-3 space-y-4">
                    <div>
                      <div className="text-sm font-semibold">Current Assets</div>
                      <p className="text-xs text-muted-foreground mt-0.5">Cash or things that become cash within ~12 months</p>
                      <div className="mt-2 space-y-1">
                        <BalanceRow line={{ key: "cash", label: "Cash", value: computed ? balanceSnapshot?.cash ?? 0 : null }} />
                        <BalanceRow line={{ key: "arUnfactored", label: "Accounts Receivable (Unfactored)", value: computed ? balanceSnapshot?.arUnfactored ?? 0 : null }} />
                        <BalanceRow line={{ key: "factoredReceivables", label: "Factored Receivables", value: computed ? balanceSnapshot?.factoredReceivables ?? 0 : null }} />
                        <BalanceRow line={{ key: "factoredReserve", label: "Factored Receivables (Reserve)", value: computed ? balanceSnapshot?.factoredReserve ?? 0 : null }} />
                        <BalanceRow line={{ key: "fuelAdvances", label: "Fuel Advances", value: computed ? balanceSnapshot?.fuelAdvances ?? 0 : null }} />
                        <BalanceRow line={{ key: "prepaid", label: "Prepaid Expenses", value: computed ? balanceSnapshot?.prepaid ?? 0 : null }} />
                        <BalanceRow line={{ key: "totalCurrentAssets", label: "Total Current Assets", value: computed ? computed.totalCurrentAssets : null, isSubtotal: true }} />
                      </div>
                    </div>

                    <div>
                      <div className="text-sm font-semibold">Property &amp; Equipment</div>
                      <p className="text-xs text-muted-foreground mt-0.5">Your trucking equipment</p>
                      <div className="mt-2 space-y-1">
                        <BalanceRow line={{ key: "trucks", label: "Trucks", value: computed ? balanceSnapshot?.trucks ?? 0 : null }} />
                        <BalanceRow line={{ key: "trailers", label: "Trailers", value: computed ? balanceSnapshot?.trailers ?? 0 : null }} />
                        <BalanceRow line={{ key: "otherEquipment", label: "Other Equipment", value: computed ? balanceSnapshot?.otherEquipment ?? 0 : null }} />
                        <BalanceRow line={{ key: "ppeCost", label: "Total Property & Equipment (Cost)", value: computed ? computed.ppeCost : null, isSubtotal: true }} />
                        <BalanceRow line={{ key: "accumDep", label: "Less: Accumulated Depreciation", value: computed ? balanceSnapshot?.accumDep ?? 0 : null }} />
                        <BalanceRow line={{ key: "netPpe", label: "Net Property & Equipment", value: computed ? computed.netPpe : null, isSubtotal: true }} />
                      </div>
                    </div>

                    <div>
                      <div className="text-sm font-semibold">Other Assets</div>
                      <div className="mt-2 space-y-1">
                        <BalanceRow line={{ key: "securityDeposits", label: "Security Deposits", value: computed ? balanceSnapshot?.securityDeposits ?? 0 : null }} />
                        <BalanceRow line={{ key: "iftaCredits", label: "IFTA Credits / Refunds Receivable", value: computed ? balanceSnapshot?.iftaCredits ?? 0 : null }} />
                        <BalanceRow line={{ key: "totalOtherAssets", label: "Total Other Assets", value: computed ? computed.totalOtherAssets : null, isSubtotal: true }} />
                      </div>
                    </div>

                    <div className="pt-2">
                      <BalanceRow line={{ key: "totalAssets", label: "Total Assets", value: computed ? computed.totalAssets : null, isTotal: true }} />
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
                        <BalanceRow line={{ key: "ap", label: "Accounts Payable", value: computed ? balanceSnapshot?.ap ?? 0 : null }} />
                        <BalanceRow line={{ key: "creditCards", label: "Credit Cards", value: computed ? balanceSnapshot?.creditCards ?? 0 : null }} />
                        <BalanceRow line={{ key: "accrued", label: "Accrued Expenses", value: computed ? balanceSnapshot?.accrued ?? 0 : null }} />
                        <BalanceRow line={{ key: "payrollTaxes", label: "Payroll & Payroll Taxes Payable", value: computed ? balanceSnapshot?.payrollTaxes ?? 0 : null }} />
                        <BalanceRow line={{ key: "fuelCards", label: "Fuel Cards Payable", value: computed ? balanceSnapshot?.fuelCards ?? 0 : null }} />
                        <BalanceRow line={{ key: "factoringAdvance", label: "Factoring Advance Liability", value: computed ? balanceSnapshot?.factoringAdvance ?? 0 : null }} />
                        <BalanceRow line={{ key: "totalCurrentLiab", label: "Total Current Liabilities", value: computed ? computed.totalCurrentLiab : null, isSubtotal: true }} />
                      </div>
                    </div>

                    <div>
                      <div className="text-sm font-semibold">Long-Term Liabilities</div>
                      <div className="mt-2 space-y-1">
                        <BalanceRow line={{ key: "truckLoans", label: "Truck Loans / Leases Payable", value: computed ? balanceSnapshot?.truckLoans ?? 0 : null }} />
                        <BalanceRow line={{ key: "otherLTDebt", label: "Other Long-Term Debt", value: computed ? balanceSnapshot?.otherLTDebt ?? 0 : null }} />
                        <BalanceRow line={{ key: "totalLongTermLiab", label: "Total Long-Term Liabilities", value: computed ? computed.totalLongTermLiab : null, isSubtotal: true }} />
                      </div>
                    </div>

                    <div className="pt-1">
                      <BalanceRow line={{ key: "totalLiabilities", label: "Total Liabilities", value: computed ? computed.totalLiabilities : null, isTotal: true }} />
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
                      <BalanceRow line={{ key: "totalLiabEquity", label: "Total Liabilities & Equity", value: computed ? computed.totalLiabEquity : null, isTotal: true }} />
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

      <ImportWithMappingDialog
        open={balanceMappingDialogOpen}
        onOpenChange={(open) => {
          setBalanceMappingDialogOpen(open);
          if (!open) setBalanceImportParsed(null);
        }}
        parsed={balanceImportParsed}
        config={BALANCE_SHEET_IMPORT_CONFIG}
        title="Map balance sheet columns"
        description="Match each balance sheet field to a column in your file. Cash, A/P, and Owner’s Capital are required."
        onConfirm={async (mapping) => {
          setIsImportingBalance(true);
          try {
            const ok = await runBalanceSheetImportWithMapping(mapping);
            if (ok) {
              toast({
                title: "Balance sheet imported",
                description: `Saved for as-of ${asOfDate}.`,
              });
            } else {
              toast({
                title: "Import not performed",
                description: "Select an As-of date and ensure the required state is loaded.",
                variant: "destructive",
              });
            }
          } catch (err: any) {
            toast({
              title: "Import failed",
              description: err?.message || "Unable to save balance sheet data.",
              variant: "destructive",
            });
          } finally {
            setIsImportingBalance(false);
          }
        }}
      />

      <Dialog
        open={isEditOpen}
        onOpenChange={(open) => {
          setIsEditOpen(open);
          if (!open) setIsSavingSnapshot(false);
        }}
      >
        <DialogContent className="sm:max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Balance Sheet Data</DialogTitle>
            <DialogDescription>
              Enter leaf line items for Assets, Liabilities, and Equity for <span className="font-medium text-foreground">{asOfDate || "this date"}</span>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* ASSETS */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Assets</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {(
                  [
                    ["cash", "Cash"],
                    ["arUnfactored", "Accounts Receivable (Unfactored)"],
                    ["factoredReceivables", "Factored Receivables"],
                    ["factoredReserve", "Factored Receivables (Reserve)"],
                    ["fuelAdvances", "Fuel Advances"],
                    ["prepaid", "Prepaid Expenses"],
                    ["trucks", "Trucks (cost)"],
                    ["trailers", "Trailers (cost)"],
                    ["otherEquipment", "Other Equipment (cost)"],
                    ["accumDep", "Accumulated Depreciation"],
                    ["securityDeposits", "Security Deposits"],
                    ["iftaCredits", "IFTA Credits / Refunds Receivable"],
                  ] as const
                ).map(([key, label]) => (
                  <div key={key} className="space-y-2">
                    <Label htmlFor={`bs-${key}`}>{label}</Label>
                    <Input
                      id={`bs-${key}`}
                      type="number"
                      step="0.01"
                      value={draftSnapshot[key]}
                      onChange={(e) => {
                        const raw = e.target.value;
                        const v = raw === "" ? 0 : Number(raw);
                        setDraftSnapshot((prev) => ({ ...prev, [key]: Number.isFinite(v) ? v : 0 }));
                      }}
                      className="text-right"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* LIABILITIES */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Liabilities</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {(
                  [
                    ["ap", "Accounts Payable"],
                    ["creditCards", "Credit Cards"],
                    ["accrued", "Accrued Expenses"],
                    ["payrollTaxes", "Payroll & Payroll Taxes Payable"],
                    ["fuelCards", "Fuel Cards Payable"],
                    ["factoringAdvance", "Factoring Advance Liability"],
                    ["truckLoans", "Truck Loans / Leases Payable"],
                    ["otherLTDebt", "Other Long-Term Debt"],
                  ] as const
                ).map(([key, label]) => (
                  <div key={key} className="space-y-2">
                    <Label htmlFor={`bs-${key}`}>{label}</Label>
                    <Input
                      id={`bs-${key}`}
                      type="number"
                      step="0.01"
                      value={draftSnapshot[key]}
                      onChange={(e) => {
                        const raw = e.target.value;
                        const v = raw === "" ? 0 : Number(raw);
                        setDraftSnapshot((prev) => ({ ...prev, [key]: Number.isFinite(v) ? v : 0 }));
                      }}
                      className="text-right"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* EQUITY */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Equity</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {(
                  [
                    ["ownersCapital", "Owner’s Capital / Paid-In Capital"],
                    ["retainedEarnings", "Retained Earnings"],
                  ] as const
                ).map(([key, label]) => (
                  <div key={key} className="space-y-2">
                    <Label htmlFor={`bs-${key}`}>{label}</Label>
                    <Input
                      id={`bs-${key}`}
                      type="number"
                      step="0.01"
                      value={draftSnapshot[key]}
                      onChange={(e) => {
                        const raw = e.target.value;
                        const v = raw === "" ? 0 : Number(raw);
                        setDraftSnapshot((prev) => ({ ...prev, [key]: Number.isFinite(v) ? v : 0 }));
                      }}
                      className="text-right"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter className="mt-6">
            <Button
              variant="outline"
              onClick={() => setIsEditOpen(false)}
              disabled={isSavingSnapshot}
            >
              Cancel
            </Button>
            <Button
              variant="secondary"
              type="button"
              onClick={() => {
                if (typeof netProfit !== "number") return;
                const balancedRetained = computeBalancedRetainedEarnings({
                  snapshot: draftSnapshot,
                  currentPeriodNetIncome: netProfit,
                });
                setDraftSnapshot((prev) => ({ ...prev, retainedEarnings: balancedRetained }));
                toast({
                  title: "Auto-balance applied",
                  description: "Retained Earnings were updated to satisfy the balance equation.",
                });
              }}
              disabled={isSavingSnapshot || typeof netProfit !== "number"}
            >
              Auto-balance retained earnings
            </Button>
            <Button
              onClick={async () => {
                if (!firestore || !companyId || !asOfDate) return;
                setIsSavingSnapshot(true);
                try {
                  const snapRef = doc(firestore, `companies/${companyId}/balanceSheetSnapshots/${asOfDate}`);
                  await setDoc(
                    snapRef,
                    {
                      ...draftSnapshot,
                      updatedAt: serverTimestamp(),
                    },
                    { merge: true }
                  );
                  setBalanceSnapshot({ ...draftSnapshot });
                  setIsEditOpen(false);
                  toast({ title: "Balance sheet saved", description: "Balance sheet data updated successfully." });
                } catch (err: any) {
                  toast({
                    title: "Save failed",
                    description: err?.message || "Unable to save balance sheet data.",
                    variant: "destructive",
                  });
                } finally {
                  setIsSavingSnapshot(false);
                }
              }}
              disabled={isSavingSnapshot || !asOfDate}
            >
              {isSavingSnapshot ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

