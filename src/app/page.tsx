'use client';

import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { DollarSign, BarChart, TrendingUp, TrendingDown, Users, AlertTriangle, Route, CalendarIcon } from 'lucide-react';
import type { Load, Driver, Expense } from '@/lib/types';
import { formatCurrency, cn } from '@/lib/utils';
import AccruedPayHealthCheck from '@/components/accrued-pay-health-check';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection } from 'firebase/firestore';
import { parse, subDays, isWithinInterval, format, startOfDay, endOfDay } from 'date-fns';

// Helper to safely parse numbers that might have currency symbols, commas, etc.
const safeParseNumber = (value: any): number => {
  if (typeof value === 'number') return isNaN(value) ? 0 : value;
  if (!value) return 0;
  // Remove currency symbols, commas, whitespace
  const cleaned = String(value).replace(/[$,\s]/g, '').trim();
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
};

export default function DashboardPage() {
  const firestore = useFirestore();

  const loadsCollection = useMemoFirebase(() => firestore ? collection(firestore, 'loads') : null, [firestore]);
  const driversCollection = useMemoFirebase(() => firestore ? collection(firestore, 'drivers') : null, [firestore]);
  const expensesCollection = useMemoFirebase(() => firestore ? collection(firestore, 'expenses') : null, [firestore]);

  const { data: loads, loading: loadsLoading } = useCollection<Load>(loadsCollection);
  const { data: drivers, loading: driversLoading } = useCollection<Driver>(driversCollection);
  const { data: expenses, loading: expensesLoading } = useCollection<Expense>(expensesCollection);

  type Period = '7d' | '30d' | '90d' | '180d' | '365d' | 'custom';
  const [selectedPeriod, setSelectedPeriod] = useState<Period>('30d');
  const [customStartDate, setCustomStartDate] = useState<Date | undefined>(undefined);
  const [customEndDate, setCustomEndDate] = useState<Date | undefined>(undefined);
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);

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
        days = 30; // fallback if custom not set
        break;
    }

    start = subDays(end, days);
    return { start, end };
  }, [selectedPeriod, customStartDate, customEndDate]);

  // Filter loads and expenses by period
  const filteredLoads = useMemo(() => {
    if (!loads) return [];
    return loads.filter(load => {
      try {
        const loadDate = parse(load.pickupDate, 'dd-MMM-yy', new Date());
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
        const expenseDate = parse(expense.date, 'dd-MMM-yy', new Date());
        return isWithinInterval(expenseDate, dateRange);
      } catch {
        return false;
      }
    });
  }, [expenses, dateRange]);

  const {
    totalRevenue,
    totalFactoringFees,
    accruedPayBalance,
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
      accruedPayBalance: 0,
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
      if (driver) {
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


    const driverSpecificDeductions = filteredExpenses
      .filter(e => e.type === 'driver' && e.driverId)
      .reduce((sum, e) => sum + safeParseNumber(e.amount), 0);

    const totalRecurringDeductions = drivers.reduce((sum, d) =>
      sum + safeParseNumber(d.recurringDeductions.insurance) + safeParseNumber(d.recurringDeductions.escrow), 0);
    const totalDriverDeductions = driverSpecificDeductions + totalRecurringDeductions;

    const accruedPayBalance = totalDriverGrossPay - totalDriverDeductions;

    const netProfit = totalRevenue - totalOperationalExpenses;
    const averageMargin = filteredLoads.length > 0 ? netProfit / filteredLoads.length : 0;

    const totalMiles = filteredLoads.reduce((sum, load) => sum + safeParseNumber(load.miles), 0);
    const averageCpm = totalMiles > 0 ? totalOperationalExpenses / totalMiles : 0;
    const averageRpm = totalMiles > 0 ? totalRevenue / totalMiles : 0;


    return {
      totalRevenue,
      totalFactoringFees,
      accruedPayBalance,
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
            Health Check Dashboard
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
            <Popover open={isDatePickerOpen} onOpenChange={setIsDatePickerOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="rounded-xl">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {customStartDate && customEndDate
                    ? `${format(customStartDate, 'MMM d')} - ${format(customEndDate, 'MMM d, yyyy')}`
                    : 'Pick dates'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <div className="flex flex-col gap-4 p-4">
                  <div>
                    <p className="text-sm font-medium mb-2">Start Date</p>
                    <Calendar
                      mode="single"
                      selected={customStartDate}
                      onSelect={setCustomStartDate}
                      disabled={(date) => customEndDate ? date > customEndDate : false}
                    />
                  </div>
                  <div>
                    <p className="text-sm font-medium mb-2">End Date</p>
                    <Calendar
                      mode="single"
                      selected={customEndDate}
                      onSelect={setCustomEndDate}
                      disabled={(date) => customStartDate ? date < customStartDate : false}
                    />
                  </div>
                  <Button
                    onClick={() => setIsDatePickerOpen(false)}
                    disabled={!customStartDate || !customEndDate}
                  >
                    Apply
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          )}

          <p className="text-sm text-muted-foreground">
            {format(dateRange.start, 'MMM d, yyyy')} - {format(dateRange.end, 'MMM d, yyyy')}
          </p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
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
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <div className="lg:col-span-2">
          <AccruedPayHealthCheck balance={accruedPayBalance} />
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Avg. Profit / Load
            </CardTitle>
            <BarChart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={cn("text-2xl font-display font-bold", averageMargin >= 0 ? 'text-green-600' : 'text-red-600')}>{formatCurrency(averageMargin)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Net profit per completed load.
            </p>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-6">
          <Card className="flex-1">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Avg. Cost per Mile</CardTitle>
              <TrendingDown className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-display font-bold">{formatCurrency(averageCpm)}</div>
            </CardContent>
          </Card>
          <Card className="flex-1">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Avg. Rate per Mile</CardTitle>
              <TrendingUp className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-display font-bold">{formatCurrency(averageRpm)}</div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
