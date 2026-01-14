'use client';

import React, { useRef } from 'react';
import { PlusCircle, MoreHorizontal, Download, Upload, Building2 } from 'lucide-react';
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
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { OwnerForm } from '@/components/owner-form';
import type { Owner } from '@/lib/types';
import { formatCurrency } from '@/lib/utils';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, doc } from 'firebase/firestore';
import { addDocumentNonBlocking, deleteDocumentNonBlocking, setDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import Papa from 'papaparse';

export default function OwnersPage() {
    const firestore = useFirestore();
    const ownersCollection = useMemoFirebase(() => firestore ? collection(firestore, 'owners') : null, [firestore]);
    const { data: owners, loading, error } = useCollection<Owner>(ownersCollection);

    const [isFormOpen, setIsFormOpen] = React.useState(false);
    const [editingOwner, setEditingOwner] = React.useState<Owner | undefined>(undefined);

    const handleAddOwner = () => {
        setEditingOwner(undefined);
        setIsFormOpen(true);
    };

    const handleEditOwner = (owner: Owner) => {
        setEditingOwner(owner);
        setIsFormOpen(true);
    };

    const handleDeleteOwner = async (ownerId: string) => {
        if (firestore && confirm('Are you sure you want to delete this owner?')) {
            const ownerDoc = doc(firestore, 'owners', ownerId);
            deleteDocumentNonBlocking(ownerDoc);
        }
    };

    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleDownloadTemplate = () => {
        const csvData = [
            ['Name', 'Unit ID', 'Percentage (e.g. 0.88)', 'Fuel Rebate (Weekly)', 'Insurance (Weekly)', 'Escrow (Weekly)', 'ELD', 'Admin Fee', 'Fuel', 'Tolls'],
            ['Acme Transit LLC', '101', '0.88', '50.00', '150', '50', '35', '25', '250', '60'],
            ['Redline Logistics', '102', '0.90', '0', '200', '0', '35', '0', '0', '0']
        ];
        const csv = Papa.unparse(csvData);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', 'owner_import_template.csv');
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
                if (results.data && firestore && ownersCollection) {
                    const importedOwners = results.data as any[];
                    let successCount = 0;

                    for (const row of importedOwners) {
                        if (!row['Name'] || !row['Percentage (e.g. 0.88)']) continue;

                        const percentage = parseFloat(row['Percentage (e.g. 0.88)']) || 0;
                        const fuelRebate = parseFloat(row['Fuel Rebate (Weekly)']) || 0;
                        const insurance = parseFloat(row['Insurance (Weekly)']) || 0;
                        const escrow = parseFloat(row['Escrow (Weekly)']) || 0;
                        const eld = parseFloat(row['ELD']) || 0;
                        const adminFee = parseFloat(row['Admin Fee']) || 0;
                        const fuel = parseFloat(row['Fuel']) || 0;
                        const tolls = parseFloat(row['Tolls']) || 0;

                        const newOwner = {
                            name: row['Name'],
                            unitId: row['Unit ID'] || '',
                            percentage,
                            fuelRebate,
                            recurringDeductions: {
                                insurance,
                                escrow,
                                eld,
                                adminFee,
                                fuel,
                                tolls,
                            },
                            recurringAdditions: {},
                        };

                        await addDocumentNonBlocking(ownersCollection, newOwner);
                        successCount++;
                    }
                    alert(`Successfully imported ${successCount} owners.`);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                }
            },
            error: (error) => {
                console.error('Error parsing CSV:', error);
                alert('Error parsing CSV file. Please check the format.');
            }
        });
    };

    const handleFormSave = async (ownerData: Omit<Owner, 'id' | 'recurringDeductions' | 'recurringAdditions'> & { insurance: number; escrow: number; eld: number; adminFee: number; fuel: number; tolls: number }) => {
        if (!firestore) return;

        const dataToSave = {
            name: ownerData.name,
            unitId: ownerData.unitId || '',
            percentage: ownerData.percentage,
            fuelRebate: ownerData.fuelRebate || 0,
            recurringDeductions: {
                insurance: ownerData.insurance,
                escrow: ownerData.escrow,
                eld: ownerData.eld,
                adminFee: ownerData.adminFee,
                fuel: ownerData.fuel,
                tolls: ownerData.tolls,
            },
            recurringAdditions: {},
        };

        if (editingOwner) {
            const ownerDoc = doc(firestore, 'owners', editingOwner.id);
            setDocumentNonBlocking(ownerDoc, dataToSave, { merge: true });
        } else {
            if (ownersCollection) {
                addDocumentNonBlocking(ownersCollection, dataToSave);
            }
        }
        setIsFormOpen(false);
        setEditingOwner(undefined);
    };

    return (
        <div className="container mx-auto py-8 space-y-8">
            <div className="flex items-center justify-between">
                <div className="flex flex-col gap-1">
                    <h1 className="font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">Owner Profiles</h1>
                    <p className="text-muted-foreground text-lg">Manage owner operators and their split agreements.</p>
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
                    <Button onClick={handleAddOwner} className="rounded-xl shadow-sm hover:shadow-md transition-all">
                        <PlusCircle className="mr-2 h-4 w-4" /> Add Owner
                    </Button>
                </div>
            </div>

            {/* Error Display */}
            {error && (
                <div className="bg-destructive/15 text-destructive px-4 py-3 rounded-md flex items-center gap-2">
                    <Building2 className="h-5 w-5" />
                    <span>Error loading owners: {error.message} (Check permissions/auth)</span>
                </div>
            )}

            <Card className="rounded-xl overflow-hidden border-border/50 shadow-sm">
                <CardHeader className="bg-muted/30 border-b border-border/40">
                    <CardTitle className="font-display">All Owners</CardTitle>
                    <CardDescription>Directory of owner operators.</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow className="hover:bg-transparent">
                                <TableHead className="pl-6">Company Name</TableHead>
                                <TableHead>Unit ID</TableHead>
                                <TableHead>Percentage</TableHead>
                                <TableHead>Fuel Rebate</TableHead>
                                <TableHead>Recurring Deductions</TableHead>
                                <TableHead className="w-[80px]">
                                    <span className="sr-only">Actions</span>
                                </TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow>
                                    <TableCell colSpan={4} className="h-24 text-center">
                                        <div className="flex flex-col gap-2">
                                            <Skeleton className="h-8 w-full" />
                                            <Skeleton className="h-8 w-full" />
                                            <Skeleton className="h-8 w-full" />
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ) : owners.length > 0 ? (
                                owners.map((owner) => (
                                    <TableRow key={owner.id} className="group hover:bg-muted/50 transition-colors cursor-default">
                                        <TableCell className="font-medium pl-6">
                                            <div className="flex items-center gap-3">
                                                <Avatar className="h-9 w-9 border border-border/50">
                                                    <AvatarFallback className="bg-primary/10 text-primary font-medium">
                                                        <Building2 className="h-4 w-4" />
                                                    </AvatarFallback>
                                                </Avatar>
                                                <span>{owner.name}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="font-mono">{owner.unitId || '-'}</TableCell>
                                        <TableCell className="font-mono text-muted-foreground">
                                            {(owner.percentage * 100).toFixed(2)}%
                                        </TableCell>
                                        <TableCell className="font-mono text-muted-foreground">
                                            {owner.fuelRebate ? formatCurrency(owner.fuelRebate) : '-'}
                                        </TableCell>
                                        <TableCell className="text-sm text-muted-foreground">
                                            <div className="flex flex-col gap-1">
                                                <span className="text-xs">Ins: <span className="font-mono text-foreground">{formatCurrency(owner.recurringDeductions.insurance)}</span></span>
                                                <span className="text-xs">Esc: <span className="font-mono text-foreground">{formatCurrency(owner.recurringDeductions.escrow)}</span></span>
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
                                                    <DropdownMenuItem onClick={() => handleEditOwner(owner)}>Edit Profile</DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => handleDeleteOwner(owner.id)} className="text-red-600">
                                                        Delete Owner
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={4} className="h-24 text-center">
                                        No owners found.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            <OwnerForm
                isOpen={isFormOpen}
                onOpenChange={setIsFormOpen}
                onSave={handleFormSave}
                owner={editingOwner}
            />
        </div>
    );
}
