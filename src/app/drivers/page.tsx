'use client';

import React, { useRef, useState } from 'react';
import { PlusCircle, Upload, Download, MoreHorizontal, Loader2, AlertCircle, CheckCircle } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ImportResult } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import Papa from 'papaparse';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
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
import { DriverForm } from '@/components/driver-form';
import type { Driver } from '@/lib/types';
import { formatCurrency } from '@/lib/utils';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, doc } from 'firebase/firestore';
import { addDocumentNonBlocking, deleteDocumentNonBlocking, setDocumentNonBlocking } from '@/firebase/non-blocking-updates';

export default function DriversPage() {
  const firestore = useFirestore();
  const driversCollection = useMemoFirebase(() => firestore ? collection(firestore, 'drivers') : null, [firestore]);
  // IMPORTANT: We now destructure 'error' to show it.
  const { data: drivers, loading, error } = useCollection<Driver>(driversCollection);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingDriver, setEditingDriver] = useState<Driver | undefined>(undefined);

  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [isImportResultOpen, setIsImportResultOpen] = useState(false);

  const handleAddDriver = () => {
    setEditingDriver(undefined);
    setIsFormOpen(true);
  };

  const handleEditDriver = (driver: Driver) => {
    setEditingDriver(driver);
    setIsFormOpen(true);
  };

  const handleDeleteDriver = async (driverId: string) => {
    if (firestore && confirm('Are you sure you want to delete this driver?')) {
      const driverDoc = doc(firestore, 'drivers', driverId);
      deleteDocumentNonBlocking(driverDoc);
    }
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDownloadTemplate = () => {
    const csvData = [
      ['First Name', 'Last Name', 'Unit ID', 'Contact number', 'Email', 'Pay Type (percentage/cpm)', 'Rate', 'Insurance (Weekly)', 'Escrow (Weekly)', 'ELD', 'Admin Fee', 'Fuel', 'Tolls'],
      ['John', 'Doe', '101', '555-1234', 'john@example.com', 'percentage', '0.25', '100', '50', '35', '25', '200', '50'],
      ['Jane', 'Smith', '102', '555-5678', 'jane@test.com', 'cpm', '0.65', '150', '0', '35', '0', '0', '0']
    ];
    const csv = Papa.unparse(csvData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'driver_import_template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleImportFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setImportResult(null);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: 'greedy',
      transformHeader: (h) => h.trim(), // Handle BOM or spaces
      complete: async (results) => {
        try {
          if (results.data && firestore && driversCollection) {
            const importedDrivers = results.data as any[];
            const errors: any[] = [];
            let successCount = 0;

            // Process in parallel for speed and to avoid hanging
            await Promise.all(importedDrivers.map(async (row, i) => {
              const rowNumber = i + 2;

              // Robust check: Requires Name OR First Name to be present.
              // AND Pay Type to be present.
              const hasName = !!(row['First Name'] || row['Name']);
              const hasPayType = !!row['Pay Type (percentage/cpm)'];

              if (!hasName || !hasPayType) {
                // Only report if row has some data
                if (Object.values(row).some(v => !!v)) {
                  errors.push({
                    row: rowNumber,
                    reason: `Missing required fields (Name or Pay Type). Found: ${JSON.stringify(row)}`,
                    data: row
                  });
                }
                return;
              }

              try {
                const payType = row['Pay Type (percentage/cpm)'].toLowerCase().includes('cpm') ? 'cpm' : 'percentage';
                const rate = parseFloat(row['Rate']) || 0;
                const insurance = parseFloat(row['Insurance (Weekly)']) || 0;
                const escrow = parseFloat(row['Escrow (Weekly)']) || 0;
                const eld = parseFloat(row['ELD']) || 0;
                const adminFee = parseFloat(row['Admin Fee']) || 0;
                const fuel = parseFloat(row['Fuel']) || 0;
                const tolls = parseFloat(row['Tolls']) || 0;

                const newDriver = {
                  firstName: row['First Name'] || row['Name']?.split(' ')[0] || '',
                  lastName: row['Last Name'] || row['Name']?.split(' ').slice(1).join(' ') || '',
                  unitId: row['Unit ID'] || '',
                  email: row['Email'] || '',
                  phoneNumber: row['Contact number'] || '',
                  payType,
                  rate,
                  recurringDeductions: {
                    insurance,
                    escrow,
                    eld,
                    adminFee,
                    fuel,
                    tolls,
                  },
                };

                await addDocumentNonBlocking(driversCollection, newDriver);
                successCount++;
              } catch (err: any) {
                errors.push({
                  row: rowNumber,
                  reason: `Failed to save: ${err.message}`,
                  data: row
                });
              }
            }));

            setImportResult({ success: successCount, errors });
            setIsImportResultOpen(true);

            // Reset file input
            if (fileInputRef.current) fileInputRef.current.value = '';
          }
        } catch (err) {
          console.error("Critical import error:", err);
          alert("A critical error occurred during import.");
        } finally {
          setIsImporting(false);
        }
      },
      error: (error) => {
        console.error('Error parsing CSV:', error);
        alert('Error parsing CSV file. Please check the format.');
        setIsImporting(false);
      }
    });
  };

  const handleSaveDriver = async (driverData: any) => {
    if (!firestore || !driversCollection) return;

    try {
      if (editingDriver) {
        // Update
        const driverDoc = doc(firestore, 'drivers', editingDriver.id);
        await setDocumentNonBlocking(driverDoc, {
          firstName: driverData.firstName,
          lastName: driverData.lastName,
          email: driverData.email,
          phoneNumber: driverData.phoneNumber,
          unitId: driverData.unitId,
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
          unitId: driverData.unitId,
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
      alert('Failed to save driver.');
    }
  };


  return (
    <div className="container mx-auto py-8 space-y-8">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">Driver Profiles</h1>
          <p className="text-muted-foreground text-lg">Manage your drivers and their pay structures.</p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="file"
            accept=".csv"
            className="hidden"
            ref={fileInputRef}
            onChange={handleImportFile}
          />
          <Button variant="outline" onClick={handleDownloadTemplate} className="rounded-xl">
            <Download className="mr-2 h-4 w-4" /> Template
          </Button>
          <Button variant="outline" onClick={handleImportClick} className="rounded-xl" disabled={isImporting}>
            {isImporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            {isImporting ? 'Importing...' : 'Import CSV'}
          </Button>
          <Button onClick={handleAddDriver} className="rounded-xl shadow-sm hover:shadow-md transition-all">
            <PlusCircle className="mr-2 h-4 w-4" /> Add Driver
          </Button>
        </div>
      </div>

      <Card className="rounded-xl overflow-hidden border-border/50 shadow-sm">
        <CardHeader className="bg-muted/30 border-b border-border/40">
          <CardTitle className="font-display">All Drivers</CardTitle>
          <CardDescription>A directory of your current fleet.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-6">Driver</TableHead>
                <TableHead>Unit ID</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Pay Structure</TableHead>
                <TableHead className="text-right">Week Deduct</TableHead>
                <TableHead className="w-[80px]">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center">
                    Loading...
                  </TableCell>
                </TableRow>
              ) : drivers.length > 0 ? (
                drivers.map((driver) => (
                  <TableRow key={driver.id} className="group hover:bg-muted/50 transition-colors cursor-default">
                    <TableCell className="font-medium pl-6">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-9 w-9 border border-border/50">
                          <AvatarFallback className="bg-primary/10 text-primary font-medium">
                            {`${driver.firstName?.[0] || ''}${driver.lastName?.[0] || ''}`.toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex flex-col">
                          <span className="font-medium">{`${driver.firstName} ${driver.lastName}`}</span>
                          <span className="text-xs text-muted-foreground font-normal">{driver.email}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{driver.unitId || '-'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{driver.phoneNumber || '-'}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="font-medium">{driver.payType}</Badge>
                      <div className="font-mono text-muted-foreground text-xs">
                        {driver.payType === 'percentage'
                          ? `${driver.rate}%`
                          : `${formatCurrency(driver.rate)}/mi`}
                      </div>
                    </TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground">
                      <div className="flex flex-col gap-1">
                        <span className="text-xs">Ins: <span className="font-mono text-foreground">{formatCurrency(driver.recurringDeductions.insurance)}</span></span>
                        <span className="text-xs">Esc: <span className="font-mono text-foreground">{formatCurrency(driver.recurringDeductions.escrow)}</span></span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button aria-haspopup="true" size="icon" variant="ghost" className="opacity-0 group-hover:opacity-100 transition-opacity">
                            <MoreHorizontal className="h-4 w-4" />
                            <span className="sr-only">Toggle menu</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                          <DropdownMenuItem onClick={() => handleEditDriver(driver)}>Edit Profile</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDeleteDriver(driver.id)} className="text-red-600">
                            Deactivate Driver
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
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
              {importResult?.success} drivers imported successfully.
              {importResult?.errors && importResult.errors.length > 0 && ` ${importResult.errors.length} rows failed.`}
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

      {/* Blocking Loading Modal */}
      <Dialog open={isImporting} onOpenChange={() => { }}>
        <DialogContent className="sm:max-w-[425px] [&>button]:hidden pointer-events-none">
          <DialogHeader>
            <DialogTitle className="flex flex-col items-center text-center gap-4 py-8">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
              <span className="text-xl">Importing Drivers...</span>
            </DialogTitle>
            <DialogDescription className="text-center">
              Please wait while we process your file. Do not close this window.
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </div>
  );
}
