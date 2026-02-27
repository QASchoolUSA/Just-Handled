"use client";

import React, { useState } from "react";
import { Upload, CheckCircle, AlertCircle, Loader2, ChevronDown, ChevronRight, FileText } from "lucide-react";
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
import { useToast } from "@/hooks/use-toast";
import { useFirestore } from "@/firebase";
import { useCompany } from "@/firebase/provider";
import { collection, getDocs, query, where, writeBatch, doc } from "firebase/firestore";
import type { Load } from "@/lib/types";

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

    const [advanceFile, setAdvanceFile] = useState<File | null>(null);
    const [agingFile, setAgingFile] = useState<File | null>(null);

    const [previewData, setPreviewData] = useState<LoadGroup[]>([]);
    const [stats, setStats] = useState<GlobalStats | null>(null);
    const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

    const [processing, setProcessing] = useState(false);
    const [uploading, setUploading] = useState(false);

    const toggleRow = (loadNumber: string) => {
        const newExpanded = new Set(expandedRows);
        if (newExpanded.has(loadNumber)) {
            newExpanded.delete(loadNumber);
        } else {
            newExpanded.add(loadNumber);
        }
        setExpandedRows(newExpanded);
    };

    const handleFileUpload = (type: 'advance' | 'aging', file: File | undefined) => {
        if (!file) return;
        if (type === 'advance') setAdvanceFile(file);
        if (type === 'aging') setAgingFile(file);
    };

    const parsePdfText = async (file: File): Promise<string> => {
        const formData = new FormData();
        formData.append('file', file);

        const res = await fetch('/api/parse-pdf', { method: 'POST', body: formData });
        if (!res.ok) {
            throw new Error(`Failed to parse ${file.name}`);
        }
        const data = await res.json();
        return data.text;
    };

    const processFiles = async () => {
        if (!advanceFile) {
            toast({ title: "Missing File", description: "Please upload the Advance Schedule PDF.", variant: "destructive" });
            return;
        }

        setProcessing(true);
        try {
            toast({ title: "Parsing PDFs...", description: "Extracting text from documents." });

            const advanceText = await parsePdfText(advanceFile);
            const agingText = agingFile ? await parsePdfText(agingFile) : '';

            // 1. Extract Advance Schedule Invoices
            const advanceInvoices: any[] = [];
            // Matches: [Customer Name?] IN-003458 02/24/2026 $4,000.00 $40.00 $40.00 $3,920.00
            const advanceRegex = /(IN-\d+(?:-[A-Za-z])?|\d{4,})\s+(\d{2}\/\d{2}\/\d{4})\s+\$([\d,.]+)\s+\$([\d,.]+)\s+\$([\d,.]+)\s+\$([\d,.]+)/g;
            let match;
            let totalScheduleAmount = 0;

            while ((match = advanceRegex.exec(advanceText)) !== null) {
                const invoiceId = match[1];
                const date = match[2];
                const amount = parseFloat(match[3].replace(/,/g, ''));
                const reserve = parseFloat(match[4].replace(/,/g, ''));
                const fee = parseFloat(match[5].replace(/,/g, ''));

                advanceInvoices.push({ invoiceId, date, amount, reserve, fee });
                totalScheduleAmount += amount;
            }

            if (advanceInvoices.length === 0) {
                toast({ title: "Parse Error", description: "Could not find any invoices in the Advance Schedule.", variant: "destructive" });
                setProcessing(false);
                return;
            }

            // Extract Prime Rate and Wire Fee
            const primeMatch = advanceText.match(/Prime rate surcharge\s+\$([\d,.]+)/i);
            const wireMatch = advanceText.match(/Wire fee\s+\$([\d,.]+)/i);

            const primeFee = primeMatch ? parseFloat(primeMatch[1].replace(/,/g, '')) : 0;
            const wireFee = wireMatch ? parseFloat(wireMatch[1].replace(/,/g, '')) : 0;
            const totalOtherCharges = primeFee + wireFee;

            // 2. Extract Aging Detail Mappings (Invoice -> Load)
            const loadMapping = new Map<string, string>();
            if (agingText) {
                // Matches: IN-003191 383862 $1,500.00 $1,485.00 01/30/2026 26
                const agingRegex = /(IN-\d+(?:-[A-Za-z])?|\d{4,})\s+([A-Za-z0-9-]+)\s+\$([\d,.]+)\s+\$([\d,.]+)/g;
                while ((match = agingRegex.exec(agingText)) !== null) {
                    const invoiceId = match[1];
                    const loadNumber = match[2];
                    loadMapping.set(invoiceId, loadNumber);
                }
            }

            // 3. Query Firestore
            toast({ title: "Matching Loads...", description: "Querying database for matches." });

            const allInvoiceIds = advanceInvoices.map(i => i.invoiceId);
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
                        snap.forEach(doc => {
                            mapFunc({ ...doc.data() as Load, id: doc.id });
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

            for (const inv of advanceInvoices) {
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
                group.totalAdvance += (inv.amount - inv.reserve - inv.fee);
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

        } catch (error: any) {
            console.error(error);
            toast({
                title: "Processing Failed",
                description: error.message || "An error occurred.",
                variant: "destructive"
            });
        } finally {
            setProcessing(false);
        }
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

            toast({
                title: "Import Successful",
                description: `Updated ${matched.length} loads with factoring data.`,
            });

            // Reset
            setAdvanceFile(null);
            setAgingFile(null);
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
                <p className="text-muted-foreground">Upload Advance Schedule and Aging Detail to accurately prorate factoring costs per load.</p>
            </div>

            {/* Upload Section */}
            {!previewData.length ? (
                <div className="grid md:grid-cols-2 gap-6">
                    <Card className="border-dashed border-2">
                        <CardHeader>
                            <CardTitle>1. Advance Schedule</CardTitle>
                            <CardDescription>Required. PDF file with invoice transactions and admin/wire fees.</CardDescription>
                        </CardHeader>
                        <CardContent className="flex flex-col items-center justify-center p-8 gap-4">
                            <div className={`p-4 rounded-full ${advanceFile ? 'bg-primary/10 text-primary' : 'bg-muted/50 text-muted-foreground'}`}>
                                {advanceFile ? <FileText className="h-8 w-8" /> : <Upload className="h-8 w-8" />}
                            </div>
                            <div className="flex flex-col items-center gap-2">
                                <Button variant={advanceFile ? "secondary" : "default"} className="relative">
                                    {advanceFile ? advanceFile.name : "Select Advance PDF"}
                                    <input
                                        type="file"
                                        accept="application/pdf"
                                        className="absolute inset-0 opacity-0 cursor-pointer"
                                        onChange={(e) => handleFileUpload('advance', e.target.files?.[0])}
                                    />
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border-dashed border-2">
                        <CardHeader>
                            <CardTitle>2. Aging Detail</CardTitle>
                            <CardDescription>Optional but recommended. Links Invoices to Load Numbers.</CardDescription>
                        </CardHeader>
                        <CardContent className="flex flex-col items-center justify-center p-8 gap-4">
                            <div className={`p-4 rounded-full ${agingFile ? 'bg-primary/10 text-primary' : 'bg-muted/50 text-muted-foreground'}`}>
                                {agingFile ? <FileText className="h-8 w-8" /> : <Upload className="h-8 w-8" />}
                            </div>
                            <div className="flex flex-col items-center gap-2">
                                <Button variant={agingFile ? "secondary" : "default"} className="relative">
                                    {agingFile ? agingFile.name : "Select Aging PDF"}
                                    <input
                                        type="file"
                                        accept="application/pdf"
                                        className="absolute inset-0 opacity-0 cursor-pointer"
                                        onChange={(e) => handleFileUpload('aging', e.target.files?.[0])}
                                    />
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    <div className="md:col-span-2 flex justify-end">
                        <Button size="lg" onClick={processFiles} disabled={processing || !advanceFile}>
                            {processing ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Processing...
                                </>
                            ) : (
                                "Analyze & Match Data"
                            )}
                        </Button>
                    </div>
                </div>
            ) : (
                <div className="space-y-6 slide-in-bottom">
                    {/* Header Controls */}
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-muted/30 p-4 rounded-lg border">
                        <div className="flex items-center gap-4">
                            <Button variant="outline" onClick={() => { setPreviewData([]); setAdvanceFile(null); setAgingFile(null); }}>
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
        </div>
    );
}
