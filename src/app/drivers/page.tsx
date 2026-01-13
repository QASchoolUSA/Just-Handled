'use client';

import React from 'react';
import { PlusCircle, MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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

  const handleFormSave = async (driverData: Omit<Driver, 'id' | 'recurringDeductions'> & { insurance: number; escrow: number }) => {
    if (!firestore) return;

    const dataToSave = {
      name: driverData.name,
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
    <div className="container mx-auto py-6">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Driver Profiles</h1>
          <p className="text-muted-foreground">Manage your drivers and their pay structures.</p>
        </div>
        <Button onClick={handleAddDriver}>
          <PlusCircle className="mr-2 h-4 w-4" /> Add Driver
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Drivers</CardTitle>
          <CardDescription>A list of all drivers in your company.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Pay Type</TableHead>
                <TableHead>Rate</TableHead>
                <TableHead>Deductions</TableHead>
                <TableHead>
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
                  <TableRow key={driver.id}>
                    <TableCell className="font-medium">{driver.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{driver.payType}</Badge>
                    </TableCell>
                    <TableCell>
                      {driver.payType === 'percentage'
                        ? `${driver.rate * 100}%`
                        : `${formatCurrency(driver.rate)}/mile`}
                    </TableCell>
                    <TableCell>
                      Ins: {formatCurrency(driver.recurringDeductions.insurance)} | Esc: {formatCurrency(driver.recurringDeductions.escrow)}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button aria-haspopup="true" size="icon" variant="ghost">
                            <MoreHorizontal className="h-4 w-4" />
                            <span className="sr-only">Toggle menu</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                          <DropdownMenuItem onClick={() => handleEditDriver(driver)}>Edit</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDeleteDriver(driver.id)} className="text-red-600">
                            Delete
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
