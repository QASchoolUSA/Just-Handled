"use client";

import React, { useState, useEffect } from "react";
import { Upload, CheckCircle, AlertCircle, Loader2, ChevronDown, ChevronRight, FileText, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useFirestore } from "@/firebase";
import { useCompany } from "@/firebase/provider";
import { collection, getDocs, query, where, writeBatch, doc, setDoc, serverTimestamp, onSnapshot, orderBy } from "firebase/firestore";
import type { Load } from "@/lib/types";
import * as Papa from "papaparse";

// --- Types ---

type InvoiceRecord = {
    invoiceId: string;
    invoiceDate: string;
    invoiceAmount: number;
    reserveAmount: number;
    transactionFee: number;
    proratedPrimeWire: number;
    totalFactoringCost: number;
};

type LoadGroup = {
    loadNumber: string;
    loadId: string | null;
    status: 'matched' | 'unmatched';
    invoices: InvoiceRecord[];
    totalInvoiceAmount: number;
    totalFactoringCost: number;
    totalAdvance: number;
};

type GlobalStats = {
    totalScheduleAmount: number;
    totalPrimeRate: number;
    totalWireFee: number;
    matchedLoadsCount: number;
    unmatchedLoadsCount: number;
    totalCost: number;
};

// --- Page Component ---

export default function FactoringPage() {
    const { toast } = useToast();
    const firestore = useFirestore();
    const { companyId } = useCompany();
    const [previewData, setPreviewData] = useState<LoadGroup[]>([]);
    const [stats, setStats] = useState<GlobalStats | null>(null);
    const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

    const [uploadHistory, setUploadHistory] = useState<any[]>([]);
    const [expandedHistoryRows, setExpandedHistoryRows] = useState<Set<string>>(new Set());

    const [processing, setProcessing] = useState(false);
    const [uploading, setUploading] = useState(false);

    // Fetch History
    useEffect(() => {
        if (!firestore || !companyId) return;

        const q = query(
            collection(firestore, `companies/${companyId}/factoringUploads`),
            orderBy('createdAt', 'desc')
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const historyData: any[] = [];
            snapshot.forEach(docSnap => {
                historyData.push({ id: docSnap.id, ...docSnap.data() });
            });
            setUploadHistory(historyData);
        }, (error) => {
            console.error("Error fetching upload history:", error);
        });

        return () => unsubscribe();
    }, [firestore, companyId]);

    const toggleHistoryRow = (id: string) => {
        const newExpanded = new Set(expandedHistoryRows);
        if (newExpanded.has(id)) {
            newExpanded.delete(id);
        } else {
            newExpanded.add(id);
        }
        setExpandedHistoryRows(newExpanded);
    };

    const toggleRow = (loadNumber: string) => {
        const newExpanded = new Set(expandedRows);
        if (newExpanded.has(loadNumber)) {
            newExpanded.delete(loadNumber);
        } else {
            newExpanded.add(loadNumber);
        }
        setExpandedRows(newExpanded);
    };

    const handleDownloadTemplate = () => {
        const csvData = [
            ['Load Number', 'Invoice Number', 'Invoice Date', 'Invoice Amount', 'Advance Amount', 'Transaction Fee', 'Prime Surcharge', 'Wire Fee'],
            ['1001A', 'IN-00123', '03/01/2026', '5000', '4950', '50', '15', '25'],
            ['1002B', 'IN-00124', '03/01/2026', '2000', '1980', '20', '', ''],
            ['1003C', 'IN-00125', '03/02/2026', '3500', '3465', '35', '', ''],
        ];
        const csv = Papa.unparse(csvData);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', 'factoring_import_template.csv');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setProcessing(true);
        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: async (results) => {
                try {
                    toast({ title: "Parsing CSV...", description: "Extracting factoring data." });
                    const rows = results.data as any[];

                    const invoicesToProcess: any[] = [];
                    const loadMappingCsv = new Map<string, string>();

                    let primeFee = 0;
                    let wireFee = 0;
                    let totalScheduleAmount = 0;

                    for (const row of rows) {
                        const invId = row['Invoice Number']?.trim();
                        const loadNum = row['Load Number']?.trim();
                        if (!invId) continue;

                        if (loadNum) loadMappingCsv.set(invId, loadNum);

                        const amount = parseFloat(row['Invoice Amount']) || 0;
                        const advance = parseFloat(row['Advance Amount']) || 0;
                        const fee = parseFloat(row['Transaction Fee']) || 0;

                        // Parse global fees from any row that includes them
                        const rowPrime = parseFloat(row['Prime Surcharge']) || 0;
                        const rowWire = parseFloat(row['Wire Fee']) || 0;
                        if (rowPrime > 0) primeFee += rowPrime;
                        if (rowWire > 0) wireFee += rowWire;

                        invoicesToProcess.push({
                            invoiceId: invId,
                            date: row['Invoice Date']?.trim() || new Date().toLocaleDateString(),
                            amount,
                            reserve: amount - advance - fee, // Calculate derived reserve manually
                            fee,
                            advance // Pass raw advance
                        });
                        totalScheduleAmount += amount;
                    }

                    if (invoicesToProcess.length === 0) {
                        throw new Error("No valid invoices found in CSV. Missing 'Invoice Number'.");
                    }

                    await buildPreviewData(invoicesToProcess, loadMappingCsv, primeFee, wireFee, totalScheduleAmount);
                    if (e.target) e.target.value = ''; // Reset input
                } catch (error: any) {
                    toast({ title: "CSV Error", description: error.message, variant: "destructive" });
                    setProcessing(false);
                }
            },
            error: (err) => {
                toast({ title: "Parse Error", description: "Failed to read CSV file.", variant: "destructive" });
                setProcessing(false);
            }
        });
    };

    // Shared generic function for building the UI from either PDF OR CSV Array!
    const buildPreviewData = async (
        invoices: any[],
        loadMapping: Map<string, string>,
        primeFee: number,
        wireFee: number,
        totalScheduleAmount: number
    ) => {
        const totalOtherCharges = primeFee + wireFee;

        // 3. Query Firestore
        toast({ title: "Matching Loads...", description: "Querying database for matches." });

        const allInvoiceIds = invoices.map(i => i.invoiceId);
        const allMappedLoadNumbers = Array.from(new Set(Array.from(loadMapping.values())));

        const loadMapByNum = new Map<string, Load & { id: string }>();
        const loadMapByInv = new Map<string, Load & { id: string }>();

        if (firestore) {
            // Chunk queries (max 30 for 'in' clause)
            const fetchChunks = async (field: 'loadNumber' | 'invoiceId', values: string[], mapFunc: (load: Load & { id: string }) => void) => {
                for (let i = 0; i < values.length; i += 30) {
                    const chunk = values.slice(i, i + 30);
                    if (chunk.length === 0) continue;
                    const q = query(collection(firestore, `companies/${companyId}/loads`), where(field, 'in', chunk));
                    const snap = await getDocs(q);
                    snap.forEach(docSnap => {
                        mapFunc({ ...docSnap.data() as Load, id: docSnap.id });
                    });
                }
            };

            await Promise.all([
                fetchChunks('loadNumber', allMappedLoadNumbers, (load) => loadMapByNum.set(load.loadNumber, load)),
                fetchChunks('invoiceId', allInvoiceIds, (load) => loadMapByInv.set(load.invoiceId, load))
            ]);
        }

        // 4. Combine and group by Load Number
        const loadsMap = new Map<string, LoadGroup>();

        for (const inv of invoices) {
            const agLoadNum = loadMapping.get(inv.invoiceId);

            let foundLoad: (Load & { id: string }) | null = null;
            if (agLoadNum && loadMapByNum.has(agLoadNum)) {
                foundLoad = loadMapByNum.get(agLoadNum)!;
            } else if (loadMapByInv.has(inv.invoiceId)) {
                foundLoad = loadMapByInv.get(inv.invoiceId)!;
            }

            const effectiveLoadNumber = foundLoad ? foundLoad.loadNumber : (agLoadNum || `Unknown (${inv.invoiceId})`);

            const proratedOther = totalScheduleAmount > 0
                ? (inv.amount / totalScheduleAmount) * totalOtherCharges
                : 0;
            const totalCost = inv.fee + proratedOther;

            if (!loadsMap.has(effectiveLoadNumber)) {
                loadsMap.set(effectiveLoadNumber, {
                    loadNumber: effectiveLoadNumber,
                    loadId: foundLoad ? foundLoad.id : null,
                    status: foundLoad ? 'matched' : 'unmatched',
                    invoices: [],
                    totalInvoiceAmount: 0,
                    totalFactoringCost: 0,
                    totalAdvance: 0
                });
            }

            const group = loadsMap.get(effectiveLoadNumber)!;
            group.invoices.push({
                invoiceId: inv.invoiceId,
                invoiceDate: inv.date,
                invoiceAmount: inv.amount,
                reserveAmount: inv.reserve,
                transactionFee: inv.fee,
                proratedPrimeWire: proratedOther,
                totalFactoringCost: totalCost
            });
            group.totalInvoiceAmount += inv.amount;
            group.totalFactoringCost += totalCost;
            group.totalAdvance += (inv.advance !== undefined ? inv.advance : (inv.amount - inv.reserve - inv.fee));
        }

        const finalPreviewData = Array.from(loadsMap.values());

        setPreviewData(finalPreviewData);
        setStats({
            totalScheduleAmount,
            totalPrimeRate: primeFee,
            totalWireFee: wireFee,
            matchedLoadsCount: finalPreviewData.filter(g => g.status === 'matched').length,
            unmatchedLoadsCount: finalPreviewData.filter(g => g.status === 'unmatched').length,
            totalCost: finalPreviewData.reduce((acc, curr) => acc + curr.totalFactoringCost, 0)
        });

        toast({ title: "Success", description: `Prepared ${finalPreviewData.length} load records.` });
        setProcessing(false);
    };

    const handleImport = async () => {
        if (!firestore) return;
        setUploading(true);

        try {
            const matched = previewData.filter(r => r.status === 'matched' && r.loadId);
            const BATCH_SIZE = 450;
            let batchIndex = 0;

            while (batchIndex < matched.length) {
                const batchChunk = matched.slice(batchIndex, batchIndex + BATCH_SIZE);
                const currentBatch = writeBatch(firestore);

                batchChunk.forEach(record => {
                    if (!record.loadId) return;
                    const loadRef = doc(firestore, `companies/${companyId}/loads`, record.loadId);

                    // We only update the factoringFee with the full prorated cost.
                    // Advance amounts from the page are sometimes handled differently in settlement,
                    // but we can update it if the user wants. The requirements say:
                    // "Analyze the files and come up with a based way to calculate the factoring fees"
                    currentBatch.update(loadRef, {
                        factoringFee: Number(record.totalFactoringCost.toFixed(2)),
                        advance: Number(record.totalAdvance.toFixed(2))
                    });
                });

                await currentBatch.commit();
                batchIndex += BATCH_SIZE;
            }

            // Save History Record
            const historyRef = doc(collection(firestore, `companies/${companyId}/factoringUploads`));
            await setDoc(historyRef, {
                createdAt: serverTimestamp(),
                stats,
                previewData
            });

            toast({
                title: "Import Successful",
                description: `Updated ${matched.length} loads and saved upload history.`,
            });

            // Reset
            setPreviewData([]);
            setStats(null);

        } catch (error) {
            console.error(error);
            toast({
                title: "Import Failed",
                description: "Could not update records.",
                variant: "destructive"
            });
        } finally {
            setUploading(false);
        }
    };

    const formatCurrency = (val: number) => {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
    };

    return (
        <div className="p-6 space-y-8 max-w-6xl mx-auto pb-24">
            <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-bold tracking-tight">Factoring Integration</h1>
                <p className="text-muted-foreground">Import Factoring advances via scheduled Template CSV to accurately prorate factoring costs per load.</p>
            </div>

            <Tabs defaultValue="new-import" className="space-y-6">
                <TabsList className="bg-muted/50 p-1">
                    <TabsTrigger value="new-import" className="rounded-md">New Import</TabsTrigger>
                    <TabsTrigger value="history" className="rounded-md">Upload History</TabsTrigger>
                </TabsList>

                <TabsContent value="new-import" className="space-y-6 mt-0">
                    {/* Upload Section */}
                    {!previewData.length ? (
                        <Card className="border-dashed border-2">
                            <CardHeader className="text-center">
                                <CardTitle>Import Factoring Advances</CardTitle>
                                <CardDescription>Download the template, fill in your advances and fees, and upload the CSV to sync with your loads.</CardDescription>
                            </CardHeader>
                            <CardContent className="flex flex-col items-center justify-center py-12 gap-6">
                                <div className="p-6 rounded-full bg-primary/10 text-primary">
                                    <Upload className="h-12 w-12" />
                                </div>
                                <div className="flex items-center gap-4">
                                    <Button variant="outline" onClick={handleDownloadTemplate} className="rounded-xl h-12 px-6">
                                        <FileText className="mr-2 h-4 w-4" /> Download Template
                                    </Button>
                                    <Button className="rounded-xl h-12 px-6 relative overflow-hidden" disabled={processing}>
                                        {processing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                                        {processing ? "Parsing CSV..." : "Select Import CSV"}
                                        <input
                                            type="file"
                                            accept=".csv"
                                            className="absolute inset-0 opacity-0 cursor-pointer"
                                            onChange={handleCsvUpload}
                                        />
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="space-y-6 slide-in-bottom">
                            {/* Header Controls */}
                            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-muted/30 p-4 rounded-lg border">
                                <div className="flex items-center gap-4">
                                    <Button variant="outline" onClick={() => { setPreviewData([]); }}>
                                        Start Over
                                    </Button>
                                    <div className="text-sm">
                                        <span className="text-muted-foreground mr-2">Matched Loads:</span>
                                        <span className="font-semibold text-green-600">{stats?.matchedLoadsCount}</span>
                                        <span className="text-muted-foreground ml-4 mr-2">Unmatched:</span>
                                        <span className="font-semibold text-red-500">{stats?.unmatchedLoadsCount}</span>
                                    </div>
                                </div>
                                <Button size="lg" onClick={handleImport} disabled={uploading || stats?.matchedLoadsCount === 0}>
                                    {uploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    Update {stats?.matchedLoadsCount} Firebase Loads
                                </Button>
                            </div>

                            {/* Stats Cards */}
                            {stats && (
                                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                                    <Card>
                                        <CardHeader className="p-4 pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Total Invoiced Amount</CardTitle></CardHeader>
                                        <CardContent className="p-4 pt-0"><div className="text-2xl font-bold">{formatCurrency(stats.totalScheduleAmount)}</div></CardContent>
                                    </Card>
                                    <Card>
                                        <CardHeader className="p-4 pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Prime Surcharge</CardTitle></CardHeader>
                                        <CardContent className="p-4 pt-0"><div className="text-2xl font-bold text-orange-600">{formatCurrency(stats.totalPrimeRate)}</div></CardContent>
                                    </Card>
                                    <Card>
                                        <CardHeader className="p-4 pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Wire Fee</CardTitle></CardHeader>
                                        <CardContent className="p-4 pt-0"><div className="text-2xl font-bold text-orange-600">{formatCurrency(stats.totalWireFee)}</div></CardContent>
                                    </Card>
                                    <Card>
                                        <CardHeader className="p-4 pb-2"><CardTitle className="text-sm font-medium text-destructive/80">Total Factoring Cost</CardTitle></CardHeader>
                                        <CardContent className="p-4 pt-0"><div className="text-2xl font-bold text-destructive">{formatCurrency(stats.totalCost)}</div></CardContent>
                                    </Card>
                                </div>
                            )}

                            {/* Preview Table */}
                            <Card>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="w-12"></TableHead>
                                            <TableHead className="w-12">Match</TableHead>
                                            <TableHead>Load Number</TableHead>
                                            <TableHead className="text-right">Total Invoice</TableHead>
                                            <TableHead className="text-right">Total Advance</TableHead>
                                            <TableHead className="text-right text-destructive font-semibold">Total Cost</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {previewData.map(group => (
                                            <React.Fragment key={group.loadNumber}>
                                                <TableRow
                                                    className="hover:bg-muted/40 cursor-pointer transition-colors"
                                                    onClick={() => toggleRow(group.loadNumber)}
                                                >
                                                    <TableCell>
                                                        {expandedRows.has(group.loadNumber) ? (
                                                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                                        ) : (
                                                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                                        )}
                                                    </TableCell>
                                                    <TableCell>
                                                        {group.status === 'matched' ? (
                                                            <CheckCircle className="h-4 w-4 text-green-500" />
                                                        ) : (
                                                            <div className="flex items-center gap-2" title="Load not found in database">
                                                                <AlertCircle className="h-4 w-4 text-red-500" />
                                                            </div>
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="font-semibold">{group.loadNumber}</TableCell>
                                                    <TableCell className="text-right">{formatCurrency(group.totalInvoiceAmount)}</TableCell>
                                                    <TableCell className="text-right">{formatCurrency(group.totalAdvance)}</TableCell>
                                                    <TableCell className="text-right font-medium text-destructive">
                                                        {formatCurrency(group.totalFactoringCost)}
                                                    </TableCell>
                                                </TableRow>

                                                {expandedRows.has(group.loadNumber) && (
                                                    <TableRow className="bg-muted/10">
                                                        <TableCell colSpan={6} className="p-0 border-b">
                                                            <div className="py-2 pl-24 pr-4 border-l-4 border-l-primary/30">
                                                                <Table className="border rounded-md bg-background overflow-hidden">
                                                                    <TableHeader className="bg-muted/40">
                                                                        <TableRow>
                                                                            <TableHead className="h-9 py-1 text-xs">Invoice #</TableHead>
                                                                            <TableHead className="h-9 py-1 text-xs">Date</TableHead>
                                                                            <TableHead className="h-9 py-1 text-xs text-right">Amount</TableHead>
                                                                            <TableHead className="h-9 py-1 text-xs text-right">Txn Fee</TableHead>
                                                                            <TableHead className="h-9 py-1 text-xs text-right">Share of Primer/Wire</TableHead>
                                                                        </TableRow>
                                                                    </TableHeader>
                                                                    <TableBody>
                                                                        {group.invoices.map(inv => (
                                                                            <TableRow key={inv.invoiceId}>
                                                                                <TableCell className="py-2 text-sm font-medium">{inv.invoiceId}</TableCell>
                                                                                <TableCell className="py-2 text-sm text-muted-foreground">{inv.invoiceDate}</TableCell>
                                                                                <TableCell className="py-2 text-sm text-right">{formatCurrency(inv.invoiceAmount)}</TableCell>
                                                                                <TableCell className="py-2 text-sm text-right">{formatCurrency(inv.transactionFee)}</TableCell>
                                                                                <TableCell className="py-2 text-sm text-right text-muted-foreground">
                                                                                    {formatCurrency(inv.proratedPrimeWire)}
                                                                                </TableCell>
                                                                            </TableRow>
                                                                        ))}
                                                                    </TableBody>
                                                                </Table>
                                                            </div>
                                                        </TableCell>
                                                    </TableRow>
                                                )}
                                            </React.Fragment>
                                        ))}
                                    </TableBody>
                                </Table>
                            </Card>
                        </div>
                    )}
                </TabsContent>

                <TabsContent value="history" className="space-y-6 mt-0">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-xl">Past Uploads</CardTitle>
                            <CardDescription>History of successfully imported factoring templates.</CardDescription>
                        </CardHeader>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-12"></TableHead>
                                    <TableHead>Date Imported</TableHead>
                                    <TableHead className="text-right">Matched Loads</TableHead>
                                    <TableHead className="text-right">Total Invoice</TableHead>
                                    <TableHead className="text-right text-destructive font-semibold">Total Cost</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {uploadHistory.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                                            No factoring history found.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    uploadHistory.map(record => {
                                        const recordDate = record.createdAt?.toDate ? record.createdAt.toDate() : new Date();
                                        return (
                                            <React.Fragment key={record.id}>
                                                <TableRow
                                                    className="hover:bg-muted/40 cursor-pointer transition-colors"
                                                    onClick={() => toggleHistoryRow(record.id)}
                                                >
                                                    <TableCell>
                                                        {expandedHistoryRows.has(record.id) ? (
                                                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                                        ) : (
                                                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="font-medium">
                                                        <div className="flex items-center gap-2">
                                                            <Clock className="h-4 w-4 text-muted-foreground" />
                                                            {recordDate.toLocaleString()}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-right">{record.stats?.matchedLoadsCount || 0}</TableCell>
                                                    <TableCell className="text-right">{formatCurrency(record.stats?.totalScheduleAmount || 0)}</TableCell>
                                                    <TableCell className="text-right font-medium text-destructive">
                                                        {formatCurrency(record.stats?.totalCost || 0)}
                                                    </TableCell>
                                                </TableRow>

                                                {expandedHistoryRows.has(record.id) && (
                                                    <TableRow className="bg-muted/10">
                                                        <TableCell colSpan={5} className="p-0 border-b">
                                                            <div className="py-4 pl-16 pr-4 border-l-4 border-l-primary/30">
                                                                <h4 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">Loads Updated in this Upload</h4>
                                                                <Table className="border rounded-md bg-background overflow-hidden">
                                                                    <TableHeader className="bg-muted/40">
                                                                        <TableRow>
                                                                            <TableHead className="h-9 py-1 text-xs">Load Number</TableHead>
                                                                            <TableHead className="h-9 py-1 text-xs text-right">Invoices</TableHead>
                                                                            <TableHead className="h-9 py-1 text-xs text-right">Total Amount</TableHead>
                                                                            <TableHead className="h-9 py-1 text-xs text-right">Advance</TableHead>
                                                                            <TableHead className="h-9 py-1 text-xs text-right text-destructive">Factoring Cost</TableHead>
                                                                        </TableRow>
                                                                    </TableHeader>
                                                                    <TableBody>
                                                                        {(record.previewData || []).filter((g: any) => g.status === 'matched').map((group: any) => (
                                                                            <TableRow key={group.loadNumber}>
                                                                                <TableCell className="py-2 text-sm font-medium">{group.loadNumber}</TableCell>
                                                                                <TableCell className="py-2 text-sm text-right text-muted-foreground">{group.invoices?.length || 0}</TableCell>
                                                                                <TableCell className="py-2 text-sm text-right">{formatCurrency(group.totalInvoiceAmount)}</TableCell>
                                                                                <TableCell className="py-2 text-sm text-right">{formatCurrency(group.totalAdvance)}</TableCell>
                                                                                <TableCell className="py-2 text-sm text-right text-destructive font-medium">
                                                                                    {formatCurrency(group.totalFactoringCost)}
                                                                                </TableCell>
                                                                            </TableRow>
                                                                        ))}
                                                                    </TableBody>
                                                                </Table>
                                                            </div>
                                                        </TableCell>
                                                    </TableRow>
                                                )}
                                            </React.Fragment>
                                        );
                                    })
                                )}
                            </TableBody>
                        </Table>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}
