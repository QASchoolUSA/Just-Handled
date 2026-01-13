'use client';

import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { DollarSign, BarChart, TrendingUp, TrendingDown, Users, AlertTriangle, Route } from 'lucide-react';
import type { Load, Driver, Expense } from '@/lib/types';
import { formatCurrency, cn } from '@/lib/utils';
import AccruedPayHealthCheck from '@/components/accrued-pay-health-check';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection } from 'firebase/firestore';

export default function DashboardPage() {
  const firestore = useFirestore();

  const loadsCollection = useMemoFirebase(() => firestore ? collection(firestore, 'loads') : null, [firestore]);
  const driversCollection = useMemoFirebase(() => firestore ? collection(firestore, 'drivers') : null, [firestore]);
  const expensesCollection = useMemoFirebase(() => firestore ? collection(firestore, 'expenses') : null, [firestore]);

  const { data: loads, loading: loadsLoading } = useCollection<Load>(loadsCollection);
  const { data: drivers, loading: driversLoading } = useCollection<Driver>(driversCollection);
  const { data: expenses, loading: expensesLoading } = useCollection<Expense>(expensesCollection);

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

    if (!loads || !drivers || !expenses) {
      return initialMetrics;
    }

    const driverMap = new Map(drivers.map(d => [d.id, d]));

    const totalRevenue = loads.reduce((sum, load) => sum + load.linehaul + load.fuelSurcharge, 0);
    const totalFactoringFees = loads.reduce((sum, load) => sum + (load.factoringFee || 0), 0);
    const companyExpenses = expenses.filter(e => e.type === 'company').reduce((sum, e) => sum + e.amount, 0);


    let totalDriverGrossPay = 0;
    let totalAdvances = 0;
    loads.forEach(load => {
      totalAdvances += load.advance || 0;
      const driver = driverMap.get(load.driverId);
      if (driver) {
        if (driver.payType === 'percentage') {
          totalDriverGrossPay += load.linehaul * driver.rate;
        } else if (driver.payType === 'cpm' && load.miles) {
          totalDriverGrossPay += load.miles * driver.rate;
        }
      }
    });

    const totalDriverPayout = totalDriverGrossPay + totalAdvances;
    const totalOperationalExpenses = companyExpenses + totalFactoringFees + totalDriverGrossPay;


    const driverSpecificDeductions = expenses
      .filter(e => e.type === 'driver' && e.driverId)
      .reduce((sum, e) => sum + e.amount, 0);

    const totalRecurringDeductions = drivers.reduce((sum, d) => sum + d.recurringDeductions.insurance + d.recurringDeductions.escrow, 0);
    const totalDriverDeductions = driverSpecificDeductions + totalRecurringDeductions;

    const accruedPayBalance = totalDriverGrossPay - totalDriverDeductions;

    const netProfit = totalRevenue - totalOperationalExpenses;
    const averageMargin = loads.length > 0 ? netProfit / loads.length : 0;

    const totalMiles = loads.reduce((sum, load) => sum + (load.miles || 0), 0);
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
  }, [loads, drivers, expenses]);

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
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-4xl font-bold tracking-tight text-foreground sm:text-5xl bg-clip-text text-transparent bg-gradient-to-r from-primary via-violet-600 to-indigo-600 w-fit">
          Health Check Dashboard
        </h1>
        <p className="text-muted-foreground text-lg max-w-2xl">
          Weekly snapshot of your company's financial health and verification status.
        </p>
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
