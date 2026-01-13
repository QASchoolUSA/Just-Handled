'use client';

import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
        <div className="container mx-auto py-6">
            <div className="flex items-center justify-center h-64">
                <p>Loading dashboard...</p>
            </div>
        </div>
    )
  }

  return (
    <div className="container mx-auto py-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Health Check Dashboard</h1>
        <p className="text-muted-foreground">
          Weekly snapshot of your company's financial health.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-4">
         <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Company Net Profit</CardTitle>
             {netProfit >= 0 ? <TrendingUp className="h-4 w-4 text-green-500" /> : <TrendingDown className="h-4 w-4 text-red-500" />}
          </CardHeader>
          <CardContent>
            <div className={cn("text-2xl font-bold", netProfit >= 0 ? 'text-green-600' : 'text-red-600')}>{formatCurrency(netProfit)}</div>
            <p className="text-xs text-muted-foreground">
              Total revenue minus all expenses and driver pay.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalRevenue)}</div>
             <p className="text-xs text-muted-foreground">
              Gross income from all loads this period.
            </p>
          </CardContent>
        </Card>
         <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Driver Payout</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalDriverPayout)}</div>
             <p className="text-xs text-muted-foreground">
              Gross pay plus cash advances.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Operational Expenses</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalOperationalExpenses)}</div>
            <p className="text-xs text-muted-foreground">
              Includes driver pay, factoring fees & company expenses.
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <AccruedPayHealthCheck balance={accruedPayBalance} />

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Average Profit per Load
            </CardTitle>
            <BarChart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={cn("text-2xl font-bold", averageMargin >= 0 ? 'text-green-600' : 'text-red-600')}>{formatCurrency(averageMargin)}</div>
            <p className="text-xs text-muted-foreground">
              Net profit per completed load this period.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Average Cost per Mile (CPM)</CardTitle>
            <TrendingDown className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(averageCpm)}</div>
            <p className="text-xs text-muted-foreground">
              Total operational costs divided by total miles.
            </p>
          </CardContent>
        </Card>
        <Card>
           <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Average Rate per Mile (RPM)</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(averageRpm)}</div>
            <p className="text-xs text-muted-foreground">
              Total revenue divided by total miles.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
