'use client';

import React, { useRef, useState, useMemo } from 'react';
import { PlusCircle, Upload, Download, Loader2, AlertCircle, CheckCircle, Search, ArrowUpDown, CalendarIcon, Trophy } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ImportResult } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { Bar, BarChart, XAxis, YAxis } from 'recharts';
import { DollarSign, Truck, Users, Wallet } from 'lucide-react';
import dynamic from 'next/dynamic';

const DriverForm = dynamic(() => import('@/components/driver-form').then(mod => mod.DriverForm), { ssr: false });
const BlockingLoadingModal = dynamic(() => import('@/components/blocking-loading-modal'), { ssr: false });

import type { Driver, Load, Expense } from '@/lib/types';
import { formatCurrency, toTitleCase, formatPhoneNumber, calculateDriverPay } from '@/lib/utils';
import { useCollection, useMemoFirebase } from '@/firebase';
import { useFirestore, useCompany } from '@/firebase/provider';
import { collection, doc, getDocs } from 'firebase/firestore';
import { format, subDays, startOfDay, endOfDay, isWithinInterval, parseISO, parse } from 'date-fns';
import { addDocumentNonBlocking, deleteDocumentNonBlocking, setDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { parseDriverTariff } from '@/lib/driver-tariff';
import { parseUploadedFile } from '@/lib/onboarding/parse-file';
import type { ParsedFile } from '@/lib/onboarding/types';
import { getMappedCell } from '@/lib/import-mapping';
import type { ColumnMapping } from '@/lib/import-mapping';
import { DRIVER_IMPORT_CONFIG } from '@/lib/import-configs';
import { ImportWithMappingDialog } from '@/components/import-with-mapping-dialog';
import { DRIVER_EARNINGS_CHART_TOP_N } from '@/lib/app-constants';
import { useToast } from '@/hooks/use-toast';

export default function DriversPage() {
  const firestore = useFirestore();
  const { companyId } = useCompany();
  const { toast } = useToast();
  const driversCollection = useMemoFirebase(() => firestore && companyId ? collection(firestore, `companies/${companyId}/drivers`) : null, [firestore, companyId]);
  // IMPORTANT: We now destructure 'error' to show it.
  const { data: drivers, loading, error } = useCollection<Driver>(driversCollection);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingDriver, setEditingDriver] = useState<Driver | undefined>(undefined);

  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [isImportResultOpen, setIsImportResultOpen] = useState(false);
  const [importParsed, setImportParsed] = useState<ParsedFile | null>(null);
  const [importMappingDialogOpen, setImportMappingDialogOpen] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const getDriverEmail = (driver: Driver) =>
    ((driver as Driver & { emailAddress?: string }).email ||
      (driver as Driver & { emailAddress?: string }).emailAddress ||
      '') as string;
  const getDriverPhone = (driver: Driver) =>
    ((driver as Driver & { phone?: string }).phoneNumber ||
      (driver as Driver & { phone?: string }).phone ||
      '') as string;

  type Period = '7d' | '30d' | '90d' | '180d' | '365d' | 'custom';
  const [selectedPeriod, setSelectedPeriod] = useState<Period>('30d');
  const [customStartDate, setCustomStartDate] = useState<Date | undefined>(undefined);
  const [customEndDate, setCustomEndDate] = useState<Date | undefined>(undefined);

  const dateRange = useMemo(() => {
    if (selectedPeriod === 'custom' && customStartDate && customEndDate) {
      return { start: startOfDay(customStartDate), end: endOfDay(customEndDate) };
    }
    const end = new Date();
    const days = selectedPeriod === '7d' ? 7 : selectedPeriod === '30d' ? 30 : selectedPeriod === '90d' ? 90 : selectedPeriod === '180d' ? 180 : selectedPeriod === '365d' ? 365 : 30;
    return { start: startOfDay(subDays(end, days)), end: endOfDay(end) };
  }, [selectedPeriod, customStartDate, customEndDate]);

  const parseDate = (dateStr: string) => {
    if (!dateStr) return new Date();
    if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) return parseISO(dateStr.split('T')[0]);
    const p = parse(dateStr, 'dd-MMM-yy', new Date());
    return isNaN(p.getTime()) ? new Date() : p;
  };

  const loadsCollection = useMemoFirebase(() => firestore && companyId ? collection(firestore, `companies/${companyId}/loads`) : null, [firestore, companyId]);
  const expensesCollection = useMemoFirebase(() => firestore && companyId ? collection(firestore, `companies/${companyId}/expenses`) : null, [firestore, companyId]);

  const { data: loadsRaw } = useCollection<Load>(loadsCollection);
  const { data: expensesRaw } = useCollection<Expense>(expensesCollection);

  const loads = useMemo(() => {
    if (!loadsRaw) return null;
    const interval = { start: dateRange.start, end: dateRange.end };
    return loadsRaw.filter(load => {
      const d = parseDate(load.deliveryDate ?? '');
      return isWithinInterval(d, interval);
    });
  }, [loadsRaw, dateRange]);

  const expenses = useMemo(() => {
    if (!expensesRaw) return null;
    const interval = { start: dateRange.start, end: dateRange.end };
    return expensesRaw.filter(exp => {
      const d = parseDate(exp.date ?? '');
      return isWithinInterval(d, interval);
    });
  }, [expensesRaw, dateRange]);

  const driverEarnings = useMemo(() => {
    if (!drivers || !loads || !expenses) return [];
    const driverMap = new Map(drivers.map(d => [d.id, d]));
    const interval = { start: dateRange.start, end: dateRange.end };
    const weeksInRange = Math.max(1, Math.ceil((dateRange.end.getTime() - dateRange.start.getTime()) / (7 * 24 * 60 * 60 * 1000)));

    type Row = { driverId: string; driverName: string; unitId?: string; loadCount: number; grossPay: number; totalDeductions: number; totalAdditions: number; netPay: number };
    const byDriver = new Map<string, Row>();

    drivers.forEach(d => {
      const recurring = (d.recurringDeductions?.insurance ?? 0) + (d.recurringDeductions?.escrow ?? 0);
      byDriver.set(d.id, {
        driverId: d.id,
        driverName: toTitleCase(`${d.firstName} ${d.lastName}`),
        unitId: d.unitId,
        loadCount: 0,
        grossPay: 0,
        totalDeductions: recurring * weeksInRange,
        totalAdditions: 0,
        netPay: 0,
      });
    });

    loads.forEach(load => {
      const d = parseDate(load.deliveryDate ?? '');
      if (!isWithinInterval(d, interval)) return;
      const driver = driverMap.get(load.driverId);
      const row = byDriver.get(load.driverId);
      if (driver && row) {
        row.loadCount += 1;
        row.grossPay += calculateDriverPay(load, driver);
      }
    });

    expenses.forEach(exp => {
      const d = parseDate(exp.date ?? '');
      if (!isWithinInterval(d, interval)) return;
      if (exp.type === 'driver' && exp.driverId) {
        const row = byDriver.get(exp.driverId);
        if (row) {
          if (exp.category === 'addition') {
            row.totalAdditions += exp.amount ?? 0;
          } else {
            row.totalDeductions += exp.amount ?? 0;
          }
        }
      }
      if (exp.type === 'owner' && exp.reimbursable && exp.driverId) {
        const row = byDriver.get(exp.driverId);
        if (row) row.totalAdditions += exp.amount ?? 0;
      }
    });

    byDriver.forEach(row => {
      row.netPay = row.grossPay + row.totalAdditions - row.totalDeductions;
    });

    return Array.from(byDriver.values())
      .filter(r => r.loadCount > 0 || r.totalDeductions > 0 || r.totalAdditions > 0)
      .sort((a, b) => b.grossPay - a.grossPay);
  }, [drivers, loads, expenses, dateRange]);

  const scoreboardTotals = useMemo(() => {
    return driverEarnings.reduce(
      (acc, r) => ({
        loadCount: acc.loadCount + r.loadCount,
        grossPay: acc.grossPay + r.grossPay,
        totalDeductions: acc.totalDeductions + r.totalDeductions,
        netPay: acc.netPay + r.netPay,
      }),
      { loadCount: 0, grossPay: 0, totalDeductions: 0, netPay: 0 }
    );
  }, [driverEarnings]);

  const handleSortToggle = () => {
    setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
  };

  // Filter and sort drivers
  const filteredAndSortedDrivers = useMemo(() => {
    if (!drivers) return [];

    let filtered = drivers;

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = drivers.filter(driver => {
        const fullName = `${driver.firstName} ${driver.lastName}`.toLowerCase();
        const unitId = driver.unitId?.toLowerCase() || '';
        const email = getDriverEmail(driver).toLowerCase();
        const phone = getDriverPhone(driver).toLowerCase();

        return fullName.includes(query) || unitId.includes(query) || email.includes(query) || phone.includes(query);
      });
    }

    // Apply sort
    return [...filtered].sort((a, b) => {
      // 1. Sort by Status (Active first)
      const statusA = a.status || 'active';
      const statusB = b.status || 'active';

      if (statusA !== statusB) {
        // 'active' comes before 'inactive'
        return statusA === 'active' ? -1 : 1;
      }

      // 2. Sort by Name (Secondary)
      const nameA = `${a.firstName} ${a.lastName}`.toLowerCase();
      const nameB = `${b.firstName} ${b.lastName}`.toLowerCase();
      const comparison = nameA.localeCompare(nameB);

      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [drivers, searchQuery, sortDirection]);

  const handleAddDriver = () => {
    setEditingDriver(undefined);
    setIsFormOpen(true);
  };

  const handleEditDriver = (driver: Driver) => {
    setEditingDriver(driver);
    setIsFormOpen(true);
  };





  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsImporting(true);
    setImportResult(null);
    try {
      const parsed = await parseUploadedFile(file);
      if (parsed.rows.length === 0) {
        toast({
          title: "No rows found",
          description: "The uploaded file has no data rows.",
          variant: "destructive",
        });
        return;
      }
      setImportParsed(parsed);
      setImportMappingDialogOpen(true);
    } catch (e) {
      toast({
        title: "Import failed",
        description: e instanceof Error ? e.message : "Failed to parse file.",
        variant: "destructive",
      });
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const runDriverImportWithMapping = async (mapping: ColumnMapping) => {
    if (!importParsed || !firestore || !driversCollection || !companyId) return;
    const errors: any[] = [];
    let successCount = 0;
    let updatedCount = 0;
    const { headers, rows } = importParsed;

    const get = (row: Record<string, unknown>, fieldId: string) => getMappedCell(row, fieldId, mapping, headers);

    const existingSnap = await getDocs(driversCollection);
    const existingByKey = new Map<string, Driver & { id: string }>();
    const normalizeNameKey = (first: string, last: string) => {
      const f = (first || '').trim().replace(/\s+/g, ' ').toLowerCase();
      const l = (last || '').trim().replace(/\s+/g, ' ').toLowerCase();
      return `${f}::${l}`;
    };
    existingSnap.forEach((d) => {
      const data = d.data() as Driver;
      const key = normalizeNameKey(data.firstName ?? '', data.lastName ?? '');
      existingByKey.set(key, { ...data, id: d.id });
    });

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] as Record<string, unknown>;
      const rowNumber = i + 2;
      const firstVal = get(row, 'firstName');
      const nameStr = firstVal != null ? String(firstVal).trim() : '';
      if (!nameStr) {
        if (Object.values(row).some((v) => v != null && String(v).trim() !== '')) {
          errors.push({ row: rowNumber, reason: 'Missing required field (First Name or Name).', data: row });
        }
        continue;
      }

      try {
        let firstName = nameStr;
        let lastName = '';
        const lastVal = get(row, 'lastName');
        if (lastVal != null && String(lastVal).trim() !== '') {
          lastName = String(lastVal).trim();
        } else if (nameStr.includes(' ')) {
          const parts = nameStr.split(/\s+/).filter(Boolean);
          firstName = parts[0] ?? '';
          lastName = parts.slice(1).join(' ').trim();
        }
        firstName = firstName.trim();
        lastName = lastName.trim();
        const nameKey = normalizeNameKey(firstName, lastName);

        const payTypeCol = get(row, 'payType');
        const rateCol = get(row, 'rate');
        const tariffCol = get(row, 'driverTariff');
        let payType: 'percentage' | 'cpm' = 'percentage';
        let rate = 0;
        if (payTypeCol != null && String(payTypeCol).trim() !== '' && rateCol != null && String(rateCol).trim() !== '') {
          const payTypeRaw = String(payTypeCol).toLowerCase();
          payType = payTypeRaw.includes('cpm') ? 'cpm' : 'percentage';
          rate = parseFloat(String(rateCol)) || 0;
          if (payType === 'cpm' && rate >= 1) rate = rate / 100;
        } else {
          const parsed = parseDriverTariff(tariffCol);
          if (parsed) {
            payType = parsed.payType;
            rate = parsed.rate;
          }
        }

        const terminationDate = get(row, 'terminationDate');
        const termStr = terminationDate != null ? String(terminationDate).trim() : '';
        const status = termStr ? 'inactive' : 'active';
        const unitId = status === 'inactive' ? '' : (get(row, 'unitId') != null ? String(get(row, 'unitId')).trim() : '');

        const num = (v: unknown) => (v != null && v !== '' ? parseFloat(String(v).replace(/[$,\s]/g, '')) || 0 : 0);
        const payload = {
          firstName: firstName || 'Unknown',
          lastName,
          unitId,
          email: get(row, 'email') != null ? String(get(row, 'email')).trim() : '',
          phoneNumber: get(row, 'phoneNumber') != null ? String(get(row, 'phoneNumber')).trim() : '',
          payType,
          rate,
          status,
          terminationDate: termStr,
          recurringDeductions: {
            insurance: num(get(row, 'insurance')),
            escrow: num(get(row, 'escrow')),
            eld: num(get(row, 'eld')),
            adminFee: num(get(row, 'adminFee')),
            fuel: num(get(row, 'fuel')),
            tolls: num(get(row, 'tolls')),
          },
        };

        const existing = existingByKey.get(nameKey);
        if (existing) {
          const driverDoc = doc(firestore, `companies/${companyId}/drivers`, existing.id);
          await setDocumentNonBlocking(driverDoc, payload, { merge: true });
          updatedCount++;
        } else {
          const docRef = await addDocumentNonBlocking(driversCollection, payload);
          if (docRef?.id) {
            existingByKey.set(nameKey, { ...payload, id: docRef.id } as Driver & { id: string });
          }
          successCount++;
        }
      } catch (err: any) {
        errors.push({ row: rowNumber, reason: err?.message ?? 'Failed to save', data: row });
      }
    }

    setImportResult({ successCount, errors, skippedCount: 0, updatedCount });
    setIsImportResultOpen(true);
    setImportParsed(null);
  };

  const handleSaveDriver = async (driverData: any) => {
    if (!firestore || !driversCollection) return;

    try {
      if (editingDriver) {
        // Update
        const driverDoc = doc(firestore, `companies/${companyId}/drivers`, editingDriver.id);
        await setDocumentNonBlocking(driverDoc, {
          firstName: driverData.firstName,
          lastName: driverData.lastName,
          email: driverData.email,
          phoneNumber: driverData.phoneNumber,
          unitId: driverData.status === 'inactive' ? '' : driverData.unitId,
          status: driverData.status,
          terminationDate: driverData.terminationDate,
          payType: driverData.payType,
          rate: driverData.rate,
          recurringDeductions: {
            insurance: driverData.insurance,
            escrow: driverData.escrow,
            eld: driverData.eld,
            adminFee: driverData.adminFee,
            fuel: driverData.fuel,
            tolls: driverData.tolls,
          },
        }, { merge: true });
      } else {
        // Add
        const newDriver = {
          firstName: driverData.firstName,
          lastName: driverData.lastName,
          email: driverData.email,
          phoneNumber: driverData.phoneNumber,
          unitId: driverData.status === 'inactive' ? '' : driverData.unitId,
          status: driverData.status,
          terminationDate: driverData.terminationDate,
          payType: driverData.payType,
          rate: driverData.rate,
          recurringDeductions: {
            insurance: driverData.insurance,
            escrow: driverData.escrow,
            eld: driverData.eld,
            adminFee: driverData.adminFee,
            fuel: driverData.fuel,
            tolls: driverData.tolls,
          },
        };
        await addDocumentNonBlocking(driversCollection, newDriver);
      }
      setIsFormOpen(false);
    } catch (error) {
      console.error('Error saving driver:', error);
      toast({
        title: "Save failed",
        description: error instanceof Error ? error.message : "Failed to save driver.",
        variant: "destructive",
      });
    }
  };


  const chartGrossData = useMemo(() => {
    return [...driverEarnings].sort((a, b) => b.grossPay - a.grossPay).slice(0, DRIVER_EARNINGS_CHART_TOP_N).map(r => ({
      name: r.driverName,
      grossPay: Math.round(r.grossPay * 100) / 100,
    }));
  }, [driverEarnings]);

  const chartLoadsData = useMemo(() => {
    return [...driverEarnings].sort((a, b) => b.loadCount - a.loadCount).slice(0, DRIVER_EARNINGS_CHART_TOP_N).map(r => ({
      name: r.driverName,
      loads: r.loadCount,
    }));
  }, [driverEarnings]);

  const grossPayChartConfig: ChartConfig = {
    name: { label: 'Driver' },
    grossPay: { label: 'Gross Pay', color: 'hsl(var(--chart-1))' },
  };
  const loadsChartConfig: ChartConfig = {
    name: { label: 'Driver' },
    loads: { label: 'Loads', color: 'hsl(var(--chart-2))' },
  };

  return (
    <div className="container mx-auto py-8 space-y-8">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">Drivers</h1>
          <p className="text-muted-foreground text-lg">
            Manage driver profiles and view earnings by period.
            {drivers && drivers.length > 0 && (
              <>
                <span className="ml-2 inline-flex items-center rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                  {drivers.length} Total
                </span>
                <span className="ml-2 inline-flex items-center rounded-md bg-green-600 px-2 py-0.5 text-xs font-medium text-white">
                  {drivers.filter(d => d.status !== 'inactive').length} On the Road
                </span>
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            ref={fileInputRef}
            onChange={handleImportFile}
          />
          <Button variant="outline" onClick={handleImportClick} className="rounded-xl" disabled={isImporting}>
            {isImporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            {isImporting ? 'Importing...' : 'Import CSV/Excel'}
          </Button>
          <Button onClick={handleAddDriver} className="rounded-xl shadow-sm hover:shadow-md transition-all">
            <PlusCircle className="mr-2 h-4 w-4" /> Add Driver
          </Button>
        </div>
      </div>

      <ImportWithMappingDialog
        open={importMappingDialogOpen}
        onOpenChange={setImportMappingDialogOpen}
        parsed={importParsed}
        config={DRIVER_IMPORT_CONFIG}
        title="Map driver columns"
        description="Match each field to a column in your file. First Name or Name is required."
        onConfirm={async (mapping) => {
          setIsImporting(true);
          try {
            await runDriverImportWithMapping(mapping);
          } finally {
            setIsImporting(false);
          }
        }}
      />

      <Tabs defaultValue="drivers" className="space-y-6">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="drivers" className="rounded-xl">Drivers</TabsTrigger>
          <TabsTrigger value="earnings" className="rounded-xl flex items-center gap-2">
            <Trophy className="h-4 w-4" /> Driver Earnings
          </TabsTrigger>
        </TabsList>

        <TabsContent value="drivers" className="mt-0">
          <Card className="rounded-xl overflow-hidden border-border/50 shadow-sm">
        <CardHeader className="bg-muted/30 border-b border-border/40">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <CardTitle className="font-display">All Drivers</CardTitle>
              <CardDescription>A directory of your current fleet.</CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search drivers..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 h-9"
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSortToggle}
                className="rounded-xl"
              >
                <ArrowUpDown className="mr-2 h-4 w-4" />
                {sortDirection === 'asc' ? 'A→Z' : 'Z→A'}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-6">Driver</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Unit ID</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Pay Structure</TableHead>
                <TableHead className="text-right">Week Deduct</TableHead>

              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center">
                    Loading...
                  </TableCell>
                </TableRow>
              ) : filteredAndSortedDrivers.length > 0 ? (
                filteredAndSortedDrivers.map((driver) => (
                  <TableRow
                    key={driver.id}
                    className="group hover:bg-muted/50 transition-colors cursor-pointer"
                    onClick={() => handleEditDriver(driver)}
                  >
                    <TableCell className="font-medium pl-6">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-9 w-9 border border-border/50">
                          <AvatarFallback className="bg-primary/10 text-primary font-medium">
                            {`${driver.firstName?.[0] || ''}${driver.lastName?.[0] || ''}`.toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex flex-col">
                          <span className="font-medium">{toTitleCase(`${driver.firstName} ${driver.lastName}`)}</span>
                          <span className="text-xs text-muted-foreground font-normal">{getDriverEmail(driver) || '—'}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={driver.status === 'inactive' ? 'secondary' : 'default'} className={driver.status === 'inactive' ? 'opacity-50' : 'bg-green-600 hover:bg-green-700'}>
                        {toTitleCase(driver.status || 'Active')}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-0.5">
                        <span className="font-mono font-medium tabular-nums">{driver.unitId || '—'}</span>
                        {driver.unitHistory && driver.unitHistory.length > 1 && (() => {
                          const previous = driver.unitHistory.filter((u) => u && u !== driver.unitId);
                          if (previous.length === 0) return null;
                          return (
                            <span className="text-xs text-muted-foreground">
                              Previously assigned: {previous.join(', ')}
                            </span>
                          );
                        })()}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatPhoneNumber(getDriverPhone(driver)) || '-'}</TableCell>
                    <TableCell>
                      <div className="font-medium">
                        {driver.payType != null && driver.rate != null
                          ? driver.payType === 'percentage'
                            ? `${parseFloat((driver.rate * 100).toFixed(2))}%`
                            : `${formatCurrency(driver.rate)}/mi`
                          : '—'}
                      </div>
                    </TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground">
                      <div className="flex flex-col gap-1">
                        <span className="text-xs">Ins: <span className="font-mono text-foreground">{formatCurrency(driver.recurringDeductions.insurance)}</span></span>
                        <span className="text-xs">Esc: <span className="font-mono text-foreground">{formatCurrency(driver.recurringDeductions.escrow)}</span></span>
                      </div>
                    </TableCell>

                  </TableRow>
                ))

              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center">
                    No drivers found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
        </TabsContent>

        <TabsContent value="earnings" className="mt-0 space-y-6">
          <Card className="rounded-xl overflow-hidden border-border/50 shadow-sm">
            <CardHeader className="bg-muted/30 border-b border-border/40">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="space-y-1 flex items-center gap-2">
                  <Trophy className="h-5 w-5 text-primary" />
                  <div>
                    <CardTitle className="font-display">Earnings by period</CardTitle>
                    <CardDescription>Select a range, then view scoreboard and charts below.</CardDescription>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Tabs value={selectedPeriod} onValueChange={(v) => setSelectedPeriod(v as Period)}>
                    <TabsList className="grid grid-cols-6 max-w-2xl">
                      <TabsTrigger value="7d">Week</TabsTrigger>
                      <TabsTrigger value="30d">Month</TabsTrigger>
                      <TabsTrigger value="90d">3M</TabsTrigger>
                      <TabsTrigger value="180d">6M</TabsTrigger>
                      <TabsTrigger value="365d">Year</TabsTrigger>
                      <TabsTrigger value="custom">Custom</TabsTrigger>
                    </TabsList>
                  </Tabs>
                  {selectedPeriod === 'custom' && (
                    <div className="flex items-center gap-2">
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" size="sm" className="w-[130px] justify-start text-left font-normal rounded-xl">
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {customStartDate ? format(customStartDate, 'LLL d, yyyy') : 'Start'}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={customStartDate}
                            onSelect={setCustomStartDate}
                            disabled={(date) => (customEndDate ? date > customEndDate : false)}
                          />
                        </PopoverContent>
                      </Popover>
                      <span className="text-muted-foreground text-sm">to</span>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" size="sm" className="w-[130px] justify-start text-left font-normal rounded-xl">
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {customEndDate ? format(customEndDate, 'LLL d, yyyy') : 'End'}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={customEndDate}
                            onSelect={setCustomEndDate}
                            disabled={(date) => (customStartDate ? date < customStartDate : false)}
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                  )}
                  <p className="text-sm text-muted-foreground hidden sm:inline">
                    {format(dateRange.start, 'MMM d, yyyy')} – {format(dateRange.end, 'MMM d, yyyy')}
                  </p>
                </div>
              </div>
            </CardHeader>
          </Card>

          {driverEarnings.length > 0 && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="rounded-xl border-border/50">
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-green-500/10">
                      <DollarSign className="h-5 w-5 text-green-600 dark:text-green-400" />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">Total Gross Pay</p>
                      <p className="text-xl font-bold">{formatCurrency(scoreboardTotals.grossPay)}</p>
                    </div>
                  </CardContent>
                </Card>
                <Card className="rounded-xl border-border/50">
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <Wallet className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">Total Net Pay</p>
                      <p className="text-xl font-bold">{formatCurrency(scoreboardTotals.netPay)}</p>
                    </div>
                  </CardContent>
                </Card>
                <Card className="rounded-xl border-border/50">
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-amber-500/10">
                      <Truck className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">Total Loads</p>
                      <p className="text-xl font-bold">{scoreboardTotals.loadCount}</p>
                    </div>
                  </CardContent>
                </Card>
                <Card className="rounded-xl border-border/50">
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-blue-500/10">
                      <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">Drivers with activity</p>
                      <p className="text-xl font-bold">{driverEarnings.length}</p>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <Card className="rounded-xl overflow-hidden border-border/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Gross pay by driver (top 12)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ChartContainer config={grossPayChartConfig} className="h-[340px] w-full min-w-0">
                      <BarChart data={chartGrossData} layout="vertical" margin={{ left: 4, right: 24 }}>
                        <XAxis type="number" tickFormatter={(v: unknown) => formatCurrency(Number(v))} />
                        <YAxis
                          type="category"
                          dataKey="name"
                          width={200}
                          tick={{ fontSize: 12 }}
                          tickLine={false}
                          axisLine={false}
                          interval={0}
                        />
                        <ChartTooltip cursor={false} content={<ChartTooltipContent formatter={(v) => formatCurrency(Number(v))} />} />
                        <Bar dataKey="grossPay" fill="hsl(var(--chart-1))" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ChartContainer>
                  </CardContent>
                </Card>
                <Card className="rounded-xl overflow-hidden border-border/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Loads by driver (top 12)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ChartContainer config={loadsChartConfig} className="h-[340px] w-full min-w-0">
                      <BarChart data={chartLoadsData} layout="vertical" margin={{ left: 4, right: 24 }}>
                        <XAxis type="number" />
                        <YAxis
                          type="category"
                          dataKey="name"
                          width={200}
                          tick={{ fontSize: 12 }}
                          tickLine={false}
                          axisLine={false}
                          interval={0}
                        />
                        <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                        <Bar dataKey="loads" fill="hsl(var(--chart-2))" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ChartContainer>
                  </CardContent>
                </Card>
              </div>
            </>
          )}

          <Card className="rounded-xl overflow-hidden border-border/50 shadow-sm">
            <CardHeader className="bg-muted/30 border-b border-border/40">
              <CardTitle className="font-display">Scoreboard</CardTitle>
              <CardDescription>Per-driver breakdown for the selected period.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-6">Driver</TableHead>
                    <TableHead>Unit ID</TableHead>
                    <TableHead className="text-right">Loads</TableHead>
                    <TableHead className="text-right">Gross Pay</TableHead>
                    <TableHead className="text-right">Deductions</TableHead>
                    <TableHead className="text-right">Net Pay</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {driverEarnings.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                        No earnings in this period. Change the range or add loads.
                      </TableCell>
                    </TableRow>
                  ) : (
                    driverEarnings.map((row) => (
                      <TableRow key={row.driverId} className="hover:bg-muted/50">
                        <TableCell className="font-medium pl-6">
                          <div className="flex items-center gap-2">
                            <Avatar className="h-8 w-8 border border-border/50">
                              <AvatarFallback className="bg-primary/10 text-primary text-xs">
                                {row.driverName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            {row.driverName}
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-muted-foreground">{row.unitId || '—'}</TableCell>
                        <TableCell className="text-right font-mono">{row.loadCount}</TableCell>
                        <TableCell className="text-right font-medium text-green-700 dark:text-green-400">{formatCurrency(row.grossPay)}</TableCell>
                        <TableCell className="text-right text-red-600 dark:text-red-400">{formatCurrency(row.totalDeductions)}</TableCell>
                        <TableCell className="text-right font-semibold">{formatCurrency(row.netPay)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
                {driverEarnings.length > 0 && (
                  <TableFooter>
                    <TableRow className="bg-muted/50 font-semibold hover:bg-muted/50">
                      <TableCell className="pl-6">Total</TableCell>
                      <TableCell />
                      <TableCell className="text-right font-mono">{scoreboardTotals.loadCount}</TableCell>
                      <TableCell className="text-right text-green-700 dark:text-green-400">{formatCurrency(scoreboardTotals.grossPay)}</TableCell>
                      <TableCell className="text-right text-red-600 dark:text-red-400">{formatCurrency(scoreboardTotals.totalDeductions)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(scoreboardTotals.netPay)}</TableCell>
                    </TableRow>
                  </TableFooter>
                )}
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <DriverForm
        isOpen={isFormOpen}
        onOpenChange={setIsFormOpen}
        onSave={handleSaveDriver}
        driver={editingDriver}
      />

      <Dialog open={isImportResultOpen} onOpenChange={setIsImportResultOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Import Results</DialogTitle>
            <DialogDescription>
              {importResult?.successCount != null && importResult.successCount > 0 && `${importResult.successCount} driver${importResult.successCount !== 1 ? 's' : ''} created. `}
              {importResult?.updatedCount != null && importResult.updatedCount > 0 && `${importResult.updatedCount} existing driver${importResult.updatedCount !== 1 ? 's' : ''} updated. `}
              {(!importResult?.successCount && !importResult?.updatedCount) && importResult?.errors?.length === 0 && 'No rows to import. '}
              {importResult?.errors && importResult.errors.length > 0 && `${importResult.errors.length} row${importResult.errors.length !== 1 ? 's' : ''} failed.`}
            </DialogDescription>
          </DialogHeader>

          {importResult?.errors && importResult.errors.length > 0 ? (
            <div className="space-y-4">
              <div className="rounded-md bg-destructive/15 p-4">
                <div className="flex">
                  <AlertCircle className="h-5 w-5 text-destructive mr-2" />
                  <div className="text-sm font-medium text-destructive">
                    The following rows could not be imported:
                  </div>
                </div>
              </div>
              <ScrollArea className="h-[300px] rounded-md border p-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[80px]">Row</TableHead>
                      <TableHead>Error</TableHead>
                      <TableHead>Data</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {importResult.errors.map((error, index) => (
                      <TableRow key={index}>
                        <TableCell className="font-mono">{error.row}</TableCell>
                        <TableCell className="text-destructive font-medium">{error.reason}</TableCell>
                        <TableCell className="text-xs text-muted-foreground font-mono">
                          {JSON.stringify(error.data).slice(0, 100)}...
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center p-8 space-y-4">
              <CheckCircle className="h-12 w-12 text-green-500" />
              <p className="text-lg font-medium">All valid rows imported successfully!</p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <BlockingLoadingModal isOpen={isImporting} title="Importing Drivers..." />
    </div>
  );
}
