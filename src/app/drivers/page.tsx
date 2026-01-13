'use client';

import React, { useRef } from 'react';
import { PlusCircle, MoreHorizontal, Download, Upload, FileDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
  const { data: drivers, loading } = useCollection<Driver>(driversCollection);

  const [isFormOpen, setIsFormOpen] = React.useState(false);
  const [editingDriver, setEditingDriver] = React.useState<Driver | undefined>(undefined);

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
      ['Name', 'Unit ID', 'Pay Type (percentage/cpm)', 'Rate', 'Insurance (Weekly)', 'Escrow (Weekly)'],
      ['John Doe', '101', 'percentage', '0.25', '100', '50'],
      ['Jane Smith', '102', 'cpm', '0.65', '150', '0']
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

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        if (results.data && firestore && driversCollection) {
          const importedDrivers = results.data as any[];
          let successCount = 0;

          for (const row of importedDrivers) {
            // Basic validation
            if (!row['Name'] || !row['Pay Type (percentage/cpm)']) continue;

            const payType = row['Pay Type (percentage/cpm)'].toLowerCase() === 'cpm' ? 'cpm' : 'percentage';
            const rate = parseFloat(row['Rate']) || 0;
            const insurance = parseFloat(row['Insurance (Weekly)']) || 0;
            const escrow = parseFloat(row['Escrow (Weekly)']) || 0;

            const newDriver = {
              name: row['Name'],
              unitId: row['Unit ID'] || undefined,
              payType,
              rate,
              recurringDeductions: {
                insurance,
                escrow,
              },
            };

            await addDocumentNonBlocking(driversCollection, newDriver);
            successCount++;
          }
          alert(`Successfully imported ${successCount} drivers.`);
          // Reset file input
          if (fileInputRef.current) fileInputRef.current.value = '';
        }
      },
      error: (error) => {
        console.error('Error parsing CSV:', error);
        alert('Error parsing CSV file. Please check the format.');
      }
    });
  };

  const handleFormSave = async (driverData: Omit<Driver, 'id' | 'recurringDeductions'> & { insurance: number; escrow: number }) => {
    if (!firestore) return;

    const dataToSave = {
      name: driverData.name,
      unitId: driverData.unitId,
      payType: driverData.payType,
      rate: driverData.rate,
      recurringDeductions: {
        insurance: driverData.insurance,
        escrow: driverData.escrow,
      },
    };

    if (editingDriver) {
      const driverDoc = doc(firestore, 'drivers', editingDriver.id);
      setDocumentNonBlocking(driverDoc, dataToSave, { merge: true });
    } else {
      if (driversCollection) {
        addDocumentNonBlocking(driversCollection, dataToSave);
      }
    }
    setIsFormOpen(false);
    setEditingDriver(undefined);
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
          <Button variant="outline" onClick={handleImportClick} className="rounded-xl">
            <Upload className="mr-2 h-4 w-4" /> Import CSV
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
                <TableHead>Pay Type</TableHead>
                <TableHead>Rate</TableHead>
                <TableHead>Deductions</TableHead>
                <TableHead className="w-[80px]">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center">
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
                            {driver.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <span>{driver.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {driver.unitId ? <Badge variant="outline" className="font-mono">{driver.unitId}</Badge> : <span className="text-muted-foreground text-sm">-</span>}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="font-medium">{driver.payType}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-muted-foreground">
                      {driver.payType === 'percentage'
                        ? `${driver.rate * 100}%`
                        : `${formatCurrency(driver.rate)}/mi`}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
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
                  <TableCell colSpan={5} className="h-24 text-center">
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
        onSave={handleFormSave}
        driver={editingDriver}
      />
    </div>
  );
}
