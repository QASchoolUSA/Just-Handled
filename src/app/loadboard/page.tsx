'use client';

import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DollarSign,
  BarChart,
  TrendingUp,
  TrendingDown,
  Users,
  Route,
  CalendarIcon,
  Truck,
  MapPin
} from 'lucide-react';
import type { Load } from '@/lib/types';
import { formatCurrency, cn } from '@/lib/utils';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { useCompany } from '@/firebase/provider';
import { collection, query, where, orderBy } from 'firebase/firestore';
import { parse, subDays, isWithinInterval, format, startOfDay, endOfDay, parseISO } from 'date-fns';

// Helper to safely parse numbers that might have currency symbols, commas, etc.
const safeParseNumber = (value: any): number => {
  if (typeof value === 'number') return isNaN(value) ? 0 : value;
  if (!value) return 0;
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

export default function LoadboardPage() {
  const firestore = useFirestore();
  const { companyId } = useCompany();

  type Period = '7d' | '30d' | '90d' | '180d' | '365d' | 'custom';
  const [selectedPeriod, setSelectedPeriod] = useState<Period>('30d');
  const [customStartDate, setCustomStartDate] = useState<Date | undefined>(undefined);
  const [customEndDate, setCustomEndDate] = useState<Date | undefined>(undefined);

  // Active Tab
  const [activeTab, setActiveTab] = useState<'dashboard' | 'loads'>('dashboard');

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
      case '7d': days = 7; break;
      case '30d': days = 30; break;
      case '90d': days = 90; break;
      case '180d': days = 180; break;
      case '365d': days = 365; break;
      case 'custom': days = 30; break; // fallback
    }

    start = subDays(end, days);
    return { start, end };
  }, [selectedPeriod, customStartDate, customEndDate]);

  // Server-side Query Configurations for Loads
  const loadsQuery = useMemoFirebase(() => {
    if (!firestore || !companyId || activeTab !== 'dashboard') return null;
    const fromStr = format(dateRange.start, 'yyyy-MM-dd');
    const toStr = format(dateRange.end, 'yyyy-MM-dd');
    return query(
      collection(firestore, `companies/${companyId}/loads`),
      where('deliveryDate', '>=', fromStr),
      where('deliveryDate', '<=', toStr)
    );
  }, [firestore, companyId, dateRange, activeTab]);

  // Fetch ALL loads for the 'loads' tab (you might want to paginate this later if it gets huge, but for now we follow the general pattern)
  // Or sort by deliveryDate desc
  const allLoadsQuery = useMemoFirebase(() => {
    if (!firestore || !companyId || activeTab !== 'loads') return null;
    return query(
      collection(firestore, `companies/${companyId}/loads`),
      // orderBy('deliveryDate', 'desc') // Ensure index exists if uncommented
    );
  }, [firestore, companyId, activeTab]);

  const { data: dashboardLoads, loading: dashboardLoading } = useCollection<Load>(loadsQuery);
  const { data: allLoads, loading: allLoadsLoading } = useCollection<Load>(allLoadsQuery);

  // Filter dashboard loads by precise interval just in case
  const filteredDashboardLoads = useMemo(() => {
    if (!dashboardLoads) return [];
    return dashboardLoads.filter(load => {
      try {
        const loadDate = parseDateAny(load.pickupDate);
        return isWithinInterval(loadDate, dateRange);
      } catch {
        return false;
      }
    });
  }, [dashboardLoads, dateRange]);

  // Sort all loads for table
  const sortedTableLoads = useMemo(() => {
     if (!allLoads) return [];
     return [...allLoads].sort((a, b) => {
        const dA = parseDateAny(a.pickupDate || a.deliveryDate).getTime();
        const dB = parseDateAny(b.pickupDate || b.deliveryDate).getTime();
        return dB - dA;
     });
  }, [allLoads]);


  // Derived Metrics
  const {
    totalRevenue,
    totalMiles,
    averageRpm,
    loadCount,
    coveredDrivers
  } = useMemo(() => {
    const initialMetrics = {
      totalRevenue: 0,
      totalMiles: 0,
      averageRpm: 0,
      loadCount: 0,
      coveredDrivers: 0
    };

    if (!filteredDashboardLoads) return initialMetrics;

    const loadCount = filteredDashboardLoads.length;
    const totalRevenue = filteredDashboardLoads.reduce((sum, load) => sum + safeParseNumber(load.invoiceAmount), 0);
    const totalMiles = filteredDashboardLoads.reduce((sum, load) => sum + safeParseNumber(load.miles), 0);
    const averageRpm = totalMiles > 0 ? totalRevenue / totalMiles : 0;
    
    // Calculate unique drivers
    const uniqueDrivers = new Set(filteredDashboardLoads.map(load => load.driverId).filter(Boolean));
    const coveredDrivers = uniqueDrivers.size;

    return {
      totalRevenue,
      totalMiles,
      averageRpm,
      loadCount,
      coveredDrivers
    };
  }, [filteredDashboardLoads]);


  return (
    <div className="container mx-auto py-8 space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="font-display text-4xl font-bold tracking-tight text-foreground sm:text-5xl bg-clip-text text-transparent bg-gradient-to-r from-primary via-violet-600 to-indigo-600 w-fit">
            Loadboard
          </h1>
          <p className="text-muted-foreground text-lg max-w-2xl">
            Manage and analyze your loads, driver assignments, and trip metrics.
          </p>
        </div>

        {/* Global Tabs Trigger */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'dashboard'|'loads')} className="w-full md:w-auto">
          <TabsList className="grid w-full grid-cols-2 lg:w-[400px]">
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="loads">All Loads Data</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {activeTab === 'dashboard' && (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
           {/* Period Selector */}
          <div className="flex flex-wrap items-center gap-4 bg-card p-4 rounded-xl border shadow-sm">
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

            <div className="ml-auto text-sm text-muted-foreground font-medium hidden md:block px-2">
              {format(dateRange.start, 'MMM d, yyyy')} - {format(dateRange.end, 'MMM d, yyyy')}
            </div>
          </div>

          {dashboardLoading ? (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-32 rounded-xl" />
              ))}
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 lg:grid-rows-2">
               <Card className="border-l-4 border-l-blue-500 hover:shadow-md transition-all">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Total Gross (Invoice)</CardTitle>
                  <DollarSign className="h-4 w-4 text-blue-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-display font-bold text-foreground">{formatCurrency(totalRevenue)}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Value of loads in period.
                  </p>
                </CardContent>
              </Card>

              <Card className="border-l-4 border-l-indigo-500 hover:shadow-md transition-all">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Load Count</CardTitle>
                  <Truck className="h-4 w-4 text-indigo-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-display font-bold text-foreground">{loadCount}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Trips completed.
                  </p>
                </CardContent>
              </Card>

              <Card className="border-l-4 border-l-amber-500 hover:shadow-md transition-all">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Total Miles</CardTitle>
                  <Route className="h-4 w-4 text-amber-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-display font-bold text-foreground">{totalMiles.toLocaleString()}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Distance covered.
                  </p>
                </CardContent>
              </Card>
              
              <Card className="border-l-4 border-l-emerald-500 hover:shadow-md transition-all">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Covered Drivers</CardTitle>
                  <Users className="h-4 w-4 text-emerald-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-display font-bold text-foreground">{coveredDrivers}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Unique active drivers on loads.
                  </p>
                </CardContent>
              </Card>
              
              <Card className="border-l-4 border-l-purple-500 md:col-span-2 lg:col-span-2 hover:shadow-md transition-all h-full flex flex-col justify-center">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Average Rate per Mile</CardTitle>
                  <TrendingUp className="h-4 w-4 text-purple-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-5xl font-display font-bold text-foreground">{formatCurrency(averageRpm)}</div>
                  <p className="text-sm text-muted-foreground mt-2">
                    RPM based on Total Gross / Total Miles.
                  </p>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}

      {activeTab === 'loads' && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
           {allLoadsLoading ? (
            <div className="bg-card rounded-xl border shadow-sm p-6">
              <div className="space-y-4">
                <Skeleton className="h-10 w-full" />
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            </div>
           ) : (
            <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow>
                      <TableHead className="font-semibold px-4 py-3 whitespace-nowrap">Load #</TableHead>
                      <TableHead className="font-semibold px-4 py-3 min-w-[200px]">Pickup Location</TableHead>
                      <TableHead className="font-semibold px-4 py-3 min-w-[200px]">Dropoff Location</TableHead>
                      <TableHead className="font-semibold px-4 py-3 whitespace-nowrap">Unit/Truck ID</TableHead>
                      <TableHead className="font-semibold px-4 py-3 whitespace-nowrap">Miles</TableHead>
                      <TableHead className="font-semibold px-4 py-3 text-right whitespace-nowrap">Total Pay / Gross</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedTableLoads.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="h-48 text-center text-muted-foreground">
                          No loads found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      sortedTableLoads.map((load) => (
                        <TableRow key={load.id} className="hover:bg-muted/30 transition-colors">
                          <TableCell className="px-4 py-3 font-medium">#{load.loadNumber}</TableCell>
                          <TableCell className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <MapPin className="h-3 w-3 text-emerald-500 shrink-0" />
                              <span className="truncate max-w-[250px] inline-block" title={load.pickupLocation}>{load.pickupLocation}</span>
                            </div>
                          </TableCell>
                          <TableCell className="px-4 py-3">
                             <div className="flex items-center gap-2">
                              <MapPin className="h-3 w-3 text-rose-500 shrink-0" />
                              <span className="truncate max-w-[250px] inline-block" title={load.deliveryLocation}>{load.deliveryLocation}</span>
                            </div>
                          </TableCell>
                          <TableCell className="px-4 py-3 text-muted-foreground">
                            {load.truckId || '-'}
                          </TableCell>
                          <TableCell className="px-4 py-3 text-muted-foreground">
                            {safeParseNumber(load.miles).toLocaleString()} mi
                          </TableCell>
                          <TableCell className="px-4 py-3 text-right font-medium text-foreground">
                            {formatCurrency(safeParseNumber(load.invoiceAmount))}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
           )}
        </div>
      )}
    </div>
  );
}
