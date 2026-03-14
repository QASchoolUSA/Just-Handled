'use client';

import React, { useRef, useState } from 'react';
import { PlusCircle, MoreHorizontal, Download, Upload, Building2, CheckCircle, AlertCircle, Loader2, ChevronDown, ChevronRight } from 'lucide-react';
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
import { Badge } from '@/components/ui/badge';
import dynamic from 'next/dynamic';

const OwnerForm = dynamic(() => import('@/components/owner-form').then(mod => mod.OwnerForm), { ssr: false });
const BlockingLoadingModal = dynamic(() => import('@/components/blocking-loading-modal'), { ssr: false });

import type { Owner, Driver } from '@/lib/types';
import { formatCurrency, toTitleCase } from '@/lib/utils';
import { useCollection, useMemoFirebase } from '@/firebase';
import { useFirestore, useCompany } from '@/firebase/provider';
import { collection, doc } from 'firebase/firestore';
import { addDocumentNonBlocking, deleteDocumentNonBlocking, setDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import Papa from 'papaparse';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { parseUploadedFile } from '@/lib/onboarding/parse-file';
import type { ParsedFile } from '@/lib/onboarding/types';
import { getMappedCell } from '@/lib/import-mapping';
import type { ColumnMapping } from '@/lib/import-mapping';
import { OWNER_IMPORT_CONFIG } from '@/lib/import-configs';
import { ImportWithMappingDialog } from '@/components/import-with-mapping-dialog';

export default function OwnersPage() {
    const firestore = useFirestore();
    const { companyId } = useCompany();
    const ownersCollection = useMemoFirebase(() => firestore && companyId ? collection(firestore, `companies/${companyId}/owners`) : null, [firestore, companyId]);
    const { data: owners, loading: ownersLoading, error: ownersError } = useCollection<Owner>(ownersCollection);

    const driversCollection = useMemoFirebase(() => firestore && companyId ? collection(firestore, `companies/${companyId}/drivers`) : null, [firestore, companyId]);
    const { data: drivers, loading: driversLoading } = useCollection<Driver>(driversCollection);

    const loading = ownersLoading || driversLoading;
    const error = ownersError; // Prioritize owner error for now

    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingOwner, setEditingOwner] = useState<Owner | undefined>(undefined);
    const [isImportResultOpen, setIsImportResultOpen] = useState(false);
    const [importResult, setImportResult] = useState<{ success: number; errors: any[] } | null>(null);
    const [isImporting, setIsImporting] = useState(false);
    const [importParsed, setImportParsed] = useState<ParsedFile | null>(null);
    const [importMappingDialogOpen, setImportMappingDialogOpen] = useState(false);
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

    const unitIdToDriverName = React.useMemo(() => {
        const map = new Map<string, string>();
        drivers.forEach(driver => {
            if (driver.unitId) {
                const fullName = `${driver.firstName} ${driver.lastName}`;
                map.set(driver.unitId, toTitleCase(fullName));
            }
        });
        return map;
    }, [drivers]);

    const groupedOwners = React.useMemo(() => {
        const groups: Record<string, Owner[]> = {};
        owners.forEach(owner => {
            if (!groups[owner.name]) {
                groups[owner.name] = [];
            }
            groups[owner.name].push(owner);
        });
        // Sort groups by name alphabetically
        const sortedGroups = Object.keys(groups).sort().reduce((acc, key) => {
            acc[key] = groups[key];
            return acc;
        }, {} as Record<string, Owner[]>);
        return sortedGroups;
    }, [owners]);

    const toggleGroup = (groupName: string) => {
        const newExpanded = new Set(expandedGroups);
        if (newExpanded.has(groupName)) {
            newExpanded.delete(groupName);
        } else {
            newExpanded.add(groupName);
        }
        setExpandedGroups(newExpanded);
    };

    const handleAddOwner = () => {
        setEditingOwner(undefined);
        setIsFormOpen(true);
    };

    const handleEditOwner = (owner: Owner) => {
        setEditingOwner(owner);
        setIsFormOpen(true);
    };

    const handleDeleteOwner = async (ownerId: string) => {
        if (firestore && companyId && confirm('Are you sure you want to delete this owner?')) {
            const ownerDoc = doc(firestore, `companies/${companyId}/owners`, ownerId);
            deleteDocumentNonBlocking(ownerDoc);
        }
    };

    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleDownloadTemplate = () => {
        const csvData = [
            ['Name', 'Unit ID', 'Percentage (e.g. 0.88)', 'Fuel Rebate (e.g. 0.5 for 50%)', 'Insurance (Weekly)', 'Escrow (Weekly)', 'ELD', 'Admin Fee', 'Fuel', 'Tolls'],
            ['Acme Transit LLC', '101', '0.88', '0.50', '150', '50', '35', '25', '250', '60'],
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

    const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        setIsImporting(true);
        setImportResult(null);
        try {
            const parsed = await parseUploadedFile(file);
            if (parsed.rows.length === 0) {
                alert('No data rows found in the file.');
                return;
            }
            setImportParsed(parsed);
            setImportMappingDialogOpen(true);
        } catch (e) {
            alert(e instanceof Error ? e.message : 'Failed to parse file.');
        } finally {
            setIsImporting(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const runOwnerImportWithMapping = async (mapping: ColumnMapping) => {
        if (!importParsed || !firestore || !ownersCollection) return;
        const { headers, rows } = importParsed;
        const get = (row: Record<string, unknown>, fieldId: string) => getMappedCell(row, fieldId, mapping, headers);
        const num = (v: unknown) => (v != null && v !== '' ? parseFloat(String(v).replace(/[$,\s]/g, '')) || 0 : 0);
        let successCount = 0;
        const errors: any[] = [];

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i] as Record<string, unknown>;
            const rowNumber = i + 2;
            const nameVal = get(row, 'name');
            const name = nameVal != null ? String(nameVal).trim() : '';
            if (!name) {
                if (Object.values(row).some(v => v != null && String(v).trim() !== '')) {
                    errors.push({ row: rowNumber, reason: 'Missing Name', data: row });
                }
                continue;
            }
            try {
                let percentage = num(get(row, 'percentage'));
                if (percentage > 1) percentage = percentage / 100;
                const newOwner = {
                    name,
                    unitId: get(row, 'unitId') != null ? String(get(row, 'unitId')).trim() : '',
                    percentage,
                    fuelRebate: num(get(row, 'fuelRebate')),
                    recurringDeductions: {
                        insurance: num(get(row, 'insurance')),
                        escrow: num(get(row, 'escrow')),
                        eld: num(get(row, 'eld')),
                        adminFee: num(get(row, 'adminFee')),
                        fuel: num(get(row, 'fuel')),
                        tolls: num(get(row, 'tolls')),
                    },
                    recurringAdditions: {},
                };
                await addDocumentNonBlocking(ownersCollection, newOwner);
                successCount++;
            } catch (err: any) {
                errors.push({ row: rowNumber, reason: err?.message ?? 'Failed to save', data: row });
            }
        }
        setImportResult({ success: successCount, errors });
        setIsImportResultOpen(true);
        setImportParsed(null);
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
            const ownerDoc = doc(firestore, `companies/${companyId}/owners`, editingOwner.id);
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
                    <p className="text-muted-foreground text-lg">
                        Manage owner operators and their split agreements.
                        {owners && owners.length > 0 && (
                            <>
                                <span className="ml-2 inline-flex items-center rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                                    {Object.keys(groupedOwners).length} Owners
                                </span>
                                <span className="ml-2 inline-flex items-center rounded-md bg-green-600 px-2 py-0.5 text-xs font-medium text-white">
                                    {owners.length} Units
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
                    <Button variant="outline" onClick={handleDownloadTemplate} className="rounded-xl">
                        <Download className="mr-2 h-4 w-4" /> Template
                    </Button>
                    <Button variant="outline" onClick={handleImportClick} className="rounded-xl" disabled={isImporting}>
                        {isImporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                        {isImporting ? 'Importing...' : 'Import CSV/Excel'}
                    </Button>
                    <Button onClick={handleAddOwner} className="rounded-xl shadow-sm hover:shadow-md transition-all">
                        <PlusCircle className="mr-2 h-4 w-4" /> Add Owner
                    </Button>
                </div>
            </div>

            <ImportWithMappingDialog
                open={importMappingDialogOpen}
                onOpenChange={setImportMappingDialogOpen}
                parsed={importParsed}
                config={OWNER_IMPORT_CONFIG}
                title="Map owner columns"
                description="Match each field to a column in your file. Name is required."
                onConfirm={async (mapping) => {
                    setIsImporting(true);
                    try {
                        await runOwnerImportWithMapping(mapping);
                    } finally {
                        setIsImporting(false);
                    }
                }}
            />

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
                                    <TableCell colSpan={6} className="h-24 text-center">
                                        <div className="flex flex-col gap-2">
                                            <Skeleton className="h-8 w-full" />
                                            <Skeleton className="h-8 w-full" />
                                            <Skeleton className="h-8 w-full" />
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ) : Object.keys(groupedOwners).length > 0 ? (
                                Object.entries(groupedOwners).map(([groupName, groupOwners]) => (
                                    <React.Fragment key={groupName}>
                                        <TableRow
                                            className="hover:bg-muted/50 cursor-pointer bg-muted/20"
                                            onClick={() => toggleGroup(groupName)}
                                        >
                                            <TableCell colSpan={6} className="py-3">
                                                <div className="flex items-center gap-2 font-medium">
                                                    {expandedGroups.has(groupName) ? (
                                                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                                    ) : (
                                                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                                    )}
                                                    <div className="flex items-center gap-2">
                                                        <Avatar className="h-6 w-6">
                                                            <AvatarFallback className="bg-primary/10 text-primary text-[10px]">
                                                                <Building2 className="h-3 w-3" />
                                                            </AvatarFallback>
                                                        </Avatar>
                                                        <span>{groupName}</span>
                                                        <Badge variant="secondary" className="ml-2 text-xs">
                                                            {groupOwners.length} Unit{groupOwners.length !== 1 ? 's' : ''}
                                                        </Badge>
                                                    </div>
                                                </div>
                                            </TableCell>
                                        </TableRow>

                                        {expandedGroups.has(groupName) && groupOwners.map((owner) => (
                                            <TableRow key={owner.id} className="group hover:bg-muted/50 transition-colors cursor-default border-l-2 border-l-transparent hover:border-l-primary">
                                                <TableCell className="pl-12 text-muted-foreground text-sm">
                                                    {unitIdToDriverName.get(owner.unitId || '') ||
                                                        (owner.unitId ? <span className="opacity-50 italic">No driver assigned</span> : '')}
                                                </TableCell>
                                                <TableCell className="font-mono font-medium">{owner.unitId || '-'}</TableCell>
                                                <TableCell className="font-mono text-muted-foreground">
                                                    {(owner.percentage * 100).toFixed(2)}%
                                                </TableCell>
                                                <TableCell className="font-mono text-muted-foreground">
                                                    {owner.fuelRebate ? `${(owner.fuelRebate * 100).toFixed(0)}%` : '-'}
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
                                                            <Button aria-haspopup="true" size="icon" variant="ghost" className="opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8">
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
                                        ))}
                                    </React.Fragment>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={6} className="h-24 text-center">
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

            {/* Import Results Dialog */}
            <Dialog open={isImportResultOpen} onOpenChange={setIsImportResultOpen}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Import Results</DialogTitle>
                        <DialogDescription>
                            {importResult?.success} owners imported successfully.
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
                        <div className="flex flex-col items-center justify-center py-8 text-green-600 gap-2">
                            <CheckCircle className="h-12 w-12" />
                            <p className="text-lg font-medium">All rows imported successfully!</p>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            <BlockingLoadingModal isOpen={isImporting} title="Importing Owners..." />
        </div>
    );
}
