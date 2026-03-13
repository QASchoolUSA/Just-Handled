'use client';

import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { DollarSign, BarChart, TrendingUp, TrendingDown, Users, AlertTriangle, Route, CalendarIcon, Receipt } from 'lucide-react';
import type { Load, Driver, Expense } from '@/lib/types';
import { formatCurrency, cn } from '@/lib/utils';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { useCompany } from '@/firebase/provider';
import { collection, query, where } from 'firebase/firestore';
import { parse, subDays, isWithinInterval, format, startOfDay, endOfDay, parseISO } from 'date-fns';

// Helper to safely parse numbers that might have currency symbols, commas, etc.
const safeParseNumber = (value: any): number => {
  if (typeof value === 'number') return isNaN(value) ? 0 : value;
  if (!value) return 0;
  // Remove currency symbols, commas, whitespace
  const cleaned = String(value).replace(/[$,\s]/g, '').trim();
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
};

// Robust date parser
const parseDateAny = (dateStr: string) => {
  if (!dateStr) return new Date();
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return parseISO(dateStr);
  return parse(dateStr, 'dd-MMM-yy', new Date());
};

export default function DashboardPage() {
  const firestore = useFirestore();
  const { companyId } = useCompany();

  type Period = '7d' | '30d' | '90d' | '180d' | '365d' | 'custom';
  const [selectedPeriod, setSelectedPeriod] = useState<Period>('30d');
  const [customStartDate, setCustomStartDate] = useState<Date | undefined>(undefined);
  const [customEndDate, setCustomEndDate] = useState<Date | undefined>(undefined);

  // Calculate date range based on selected period
  const dateRange = useMemo(() => {
    if (selectedPeriod === 'custom' && customStartDate && customEndDate) {
      return {
        start: startOfDay(customStartDate),
        end: endOfDay(customEndDate)
      };
    }

    const end = new Date();
    let start: Date;
    let days: number;

    switch (selectedPeriod) {
      case '7d':
        days = 7;
        break;
      case '30d':
        days = 30;
        break;
      case '90d':
        days = 90;
        break;
      case '180d':
        days = 180;
        break;
      case '365d':
        days = 365;
        break;
      case 'custom':
        days = 30; // fallback
        break;
    }

    start = subDays(end, days);
    return { start, end };
  }, [selectedPeriod, customStartDate, customEndDate]);

  // Server-side Query Configurations
  const loadsQuery = useMemoFirebase(() => {
    if (!firestore || !companyId) return null;
    const fromStr = format(dateRange.start, 'yyyy-MM-dd');
    const toStr = format(dateRange.end, 'yyyy-MM-dd');
    return query(
      collection(firestore, `companies/${companyId}/loads`),
      where('deliveryDate', '>=', fromStr),
      where('deliveryDate', '<=', toStr)
    );
  }, [firestore, companyId, dateRange]);

  const expensesQuery = useMemoFirebase(() => {
    if (!firestore || !companyId) return null;
    const fromStr = format(dateRange.start, 'yyyy-MM-dd');
    const toStr = format(dateRange.end, 'yyyy-MM-dd');
    return query(
      collection(firestore, `companies/${companyId}/expenses`),
      where('date', '>=', fromStr),
      where('date', '<=', toStr + 'T23:59:59.999Z')
    );
  }, [firestore, companyId, dateRange]);

  // Drivers we typically fetch all because they are reference data (and list is small)
  const driversCollection = useMemoFirebase(() => firestore && companyId ? collection(firestore, `companies/${companyId}/drivers`) : null, [firestore, companyId]);

  const { data: loads, loading: loadsLoading } = useCollection<Load>(loadsQuery);
  const { data: drivers, loading: driversLoading } = useCollection<Driver>(driversCollection); // Keep fetching all drivers
  const { data: expenses, loading: expensesLoading } = useCollection<Expense>(expensesQuery);

  // Filter loads and expenses by period
  const filteredLoads = useMemo(() => {
    if (!loads) return [];
    return loads.filter(load => {
      try {
        const loadDate = parseDateAny(load.pickupDate);
        return isWithinInterval(loadDate, dateRange);
      } catch {
        return false;
      }
    });
  }, [loads, dateRange]);

  const filteredExpenses = useMemo(() => {
    if (!expenses) return [];
    return expenses.filter(expense => {
      try {
        const expenseDate = parseDateAny(expense.date);
        return isWithinInterval(expenseDate, dateRange);
      } catch {
        return false;
      }
    });
  }, [expenses, dateRange]);

  const {
    totalRevenue,
    totalFactoringFees,
    averageMargin,
    netProfit,
    totalDriverPayout,
    totalOperationalExpenses,
    averageCpm,
    averageRpm
  } = useMemo(() => {
    const initialMetrics = {
      totalRevenue: 0,
      totalFactoringFees: 0,
      averageMargin: 0,
      netProfit: 0,
      totalDriverPayout: 0,
      totalOperationalExpenses: 0,
      averageCpm: 0,
      averageRpm: 0
    };

    if (!filteredLoads || !drivers || !filteredExpenses) {
      return initialMetrics;
    }

    const driverMap = new Map(drivers.map(d => [d.id, d]));

    // Use invoiceAmount since that's the actual field in your Load type
    const totalRevenue = filteredLoads.reduce((sum, load) => sum + safeParseNumber(load.invoiceAmount), 0);
    const totalFactoringFees = filteredLoads.reduce((sum, load) => sum + safeParseNumber(load.factoringFee), 0);
    const companyExpenses = filteredExpenses.filter(e => e.type === 'company').reduce((sum, e) => sum + safeParseNumber(e.amount), 0);


    let totalDriverGrossPay = 0;
    let totalAdvances = 0;
    filteredLoads.forEach(load => {
      totalAdvances += safeParseNumber(load.advance);
      const driver = driverMap.get(load.driverId);
      if (driver && driver.payType != null && driver.rate != null) {
        const invoiceAmt = safeParseNumber(load.invoiceAmount);
        const miles = safeParseNumber(load.miles);
        const driverRate = safeParseNumber(driver.rate);
        if (driver.payType === 'percentage') {
          totalDriverGrossPay += invoiceAmt * driverRate;
        } else if (driver.payType === 'cpm' && miles > 0) {
          totalDriverGrossPay += miles * driverRate;
        }
      }
    });

    const totalDriverPayout = totalDriverGrossPay + totalAdvances;
    const totalOperationalExpenses = companyExpenses + totalFactoringFees + totalDriverGrossPay;


    const netProfit = totalRevenue - totalOperationalExpenses;
    const averageMargin = filteredLoads.length > 0 ? netProfit / filteredLoads.length : 0;

    const totalMiles = filteredLoads.reduce((sum, load) => sum + safeParseNumber(load.miles), 0);
    const averageCpm = totalMiles > 0 ? totalOperationalExpenses / totalMiles : 0;
    const averageRpm = totalMiles > 0 ? totalRevenue / totalMiles : 0;


    return {
      totalRevenue,
      totalFactoringFees,
      averageMargin,
      netProfit,
      totalDriverPayout,
      totalOperationalExpenses,
      averageCpm,
      averageRpm
    };
  }, [filteredLoads, drivers, filteredExpenses]);

  const isLoading = loadsLoading || driversLoading || expensesLoading;

  if (isLoading) {
    return (
      <div className="container mx-auto py-8 space-y-8">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-12 w-64 rounded-xl" />
          <Skeleton className="h-6 w-96 rounded-lg" />
        </div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <Skeleton className="lg:col-span-2 h-64 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
          <div className="flex flex-col gap-6">
            <Skeleton className="flex-1 rounded-xl" />
            <Skeleton className="flex-1 rounded-xl" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto py-8 space-y-8">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="font-display text-4xl font-bold tracking-tight text-foreground sm:text-5xl bg-clip-text text-transparent bg-gradient-to-r from-primary via-violet-600 to-indigo-600 w-fit">
            Fleet Performance Overview
          </h1>
          <p className="text-muted-foreground text-lg max-w-2xl">
            Weekly snapshot of your company's financial health and verification status.
          </p>
        </div>

        {/* Period Selector */}
        <div className="flex flex-wrap items-center gap-4">
          <Tabs value={selectedPeriod} onValueChange={(value) => setSelectedPeriod(value as Period)}>
            <TabsList className="grid w-full grid-cols-6 max-w-2xl">
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
                  <Button
                    variant="outline"
                    className="w-[140px] justify-start text-left font-normal rounded-xl shadow-sm"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {customStartDate ? format(customStartDate, "LLL dd, yyyy") : <span>Start</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={customStartDate}
                    onSelect={setCustomStartDate}
                    initialFocus
                    captionLayout="dropdown"
                    fromYear={2020}
                    toYear={new Date().getFullYear() + 5}
                    disabled={(date) => customEndDate ? date > customEndDate : false}
                  />
                </PopoverContent>
              </Popover>

              <span className="text-muted-foreground text-sm">to</span>

              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-[140px] justify-start text-left font-normal rounded-xl shadow-sm"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {customEndDate ? format(customEndDate, "LLL dd, yyyy") : <span>End</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={customEndDate}
                    onSelect={setCustomEndDate}
                    initialFocus
                    captionLayout="dropdown"
                    fromYear={2020}
                    toYear={new Date().getFullYear() + 5}
                    disabled={(date) => customStartDate ? date < startOfDay(customStartDate) : false}
                  />
                </PopoverContent>
              </Popover>
            </div>
          )}

          <p className="text-sm text-muted-foreground">
            {format(dateRange.start, 'MMM d, yyyy')} - {format(dateRange.end, 'MMM d, yyyy')}
          </p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-5">
        <Card className="border-l-4 border-l-green-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Company Net Profit</CardTitle>
            {netProfit >= 0 ? <TrendingUp className="h-4 w-4 text-green-500" /> : <TrendingDown className="h-4 w-4 text-red-500" />}
          </CardHeader>
          <CardContent>
            <div className={cn("text-3xl font-display font-bold", netProfit >= 0 ? 'text-green-600' : 'text-red-600')}>{formatCurrency(netProfit)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Total revenue minus all expenses.
            </p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-display font-bold text-foreground">{formatCurrency(totalRevenue)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Gross income from all loads.
            </p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-orange-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Driver Payout</CardTitle>
            <Users className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-display font-bold text-foreground">{formatCurrency(totalDriverPayout)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Gross pay + cash advances.
            </p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-slate-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Operational Costs</CardTitle>
            <DollarSign className="h-4 w-4 text-slate-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-display font-bold text-foreground">{formatCurrency(totalOperationalExpenses)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Driver pay + fees + expenses.
            </p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-purple-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Factoring Fees</CardTitle>
            <Receipt className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-display font-bold text-foreground">{formatCurrency(totalFactoringFees)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Advances and factoring costs.
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Avg. Profit / Load
            </CardTitle>
            <BarChart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={cn("text-5xl font-display font-bold", averageMargin >= 0 ? 'text-green-600' : 'text-red-600')}>{formatCurrency(averageMargin)}</div>
            <p className="text-sm text-muted-foreground mt-2">
              Net profit per completed load.
            </p>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-6 lg:col-span-2">
          <div className="grid grid-cols-2 gap-6 h-full">
            <Card className="flex-1 flex flex-col justify-center">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Avg. Cost per Mile</CardTitle>
                <TrendingDown className="h-4 w-4 text-red-500" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-display font-bold">{formatCurrency(averageCpm)}</div>
              </CardContent>
            </Card>
            <Card className="flex-1 flex flex-col justify-center">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Avg. Rate per Mile</CardTitle>
                <TrendingUp className="h-4 w-4 text-green-500" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-display font-bold">{formatCurrency(averageRpm)}</div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
