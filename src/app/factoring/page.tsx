"use client";

import { useState } from "react";
import * as XLSX from "xlsx";
import { Upload, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
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
import { collection, getDocs, query, where, writeBatch, doc } from "firebase/firestore";
import type { Load } from "@/lib/types";

type MatchedRecord = {
    invoiceId: string;
    advance: number;
    factoringFee: number;
    loadId?: string;
    loadNumber?: string;
    status: 'matched' | 'unmatched';
};

export default function FactoringPage() {
    const { toast } = useToast();
    const firestore = useFirestore();

    const [file, setFile] = useState<File | null>(null);
    const [previewData, setPreviewData] = useState<MatchedRecord[]>([]);
    const [processing, setProcessing] = useState(false);
    const [uploading, setUploading] = useState(false);

    // 1. Handle File Selection & Parsing
    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (!selectedFile) return;

        console.log("File selected:", selectedFile.name);
        toast({ title: "Reading file...", description: "Scanning for headers..." });

        setFile(selectedFile);
        setProcessing(true);

        try {
            const data = await selectedFile.arrayBuffer();
            const workbook = XLSX.read(data);
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];

            // Get all data as arrays first to find the header row
            const rawRows = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1 });
            console.log("Total rows:", rawRows.length);

            if (rawRows.length === 0) {
                toast({ title: "Empty File", description: "No rows found.", variant: "destructive" });
                setProcessing(false);
                return;
            }

            // Find the header row index by scoring candidates
            // We look for the row that contains the MOST keywords, avoiding metadata/title rows
            let bestHeaderRowIndex = -1;
            let maxScore = 0;
            const headerKeywords = ["invoice number", "invoice #", "load", "advance", "fee", "total", "amount", "carrier", "date", "balance"];

            for (let i = 0; i < Math.min(rawRows.length, 30); i++) {
                const row = rawRows[i];
                if (!Array.isArray(row)) continue;

                // Calculate score for this row
                let score = 0;
                const rowString = row.map(c => String(c || "").toLowerCase()).join(" ");

                headerKeywords.forEach(keyword => {
                    if (rowString.includes(keyword)) score++;
                });

                // Require at least 2 matches to consider it a valid header (e.g. "Invoice" AND "Fee")
                // Or if we find "invoice number" explicitly, give it a big boost
                if (rowString.includes("invoice number")) score += 2;

                if (score > maxScore) {
                    maxScore = score;
                    bestHeaderRowIndex = i;
                }
            }

            if (bestHeaderRowIndex === -1 || maxScore < 2) {
                toast({
                    title: "Structure Mismatch",
                    description: "Could not find a valid header row.",
                    variant: "destructive"
                });
                console.error("Scanning failed. Best score:", maxScore);
                setProcessing(false);
                return;
            }

            console.log(`Found header at index ${bestHeaderRowIndex} with score ${maxScore}`);
            const headerRowIndex = bestHeaderRowIndex;

            // 2. Parsed with dense arrays (defval: "") to ensure alignment
            // Use Array.from to force sparse arrays to become dense with undefineds, then map to strings
            const headers = Array.from(rawRows[headerRowIndex] || []).map((h: any) => String(h || "").trim());
            const dataRows = rawRows.slice(headerRowIndex + 1);

            console.log("Headers:", headers);

            // 3. Find Column Indices
            const findColIndex = (candidates: string[]) => {
                for (const candidate of candidates) {
                    const index = headers.findIndex((h: string) =>
                        h && h.toLowerCase().includes(candidate.toLowerCase())
                    );
                    if (index !== -1) return index;
                }
                return -1;
            };

            const idxInvoice = findColIndex(["Invoice Number", "Invoice #", "Load #"]);
            const idxAdvance = findColIndex(["Advance Amount", "Advance"]);
            const idxFee = findColIndex(["Total Fee", "Factoring Fee", "Factoring", "Fee"]);

            if (idxInvoice === -1) {
                toast({ title: "Missing Column", description: "Found header row but missing 'Invoice Number' column.", variant: "destructive" });
                setProcessing(false);
                return;
            }

            if (!firestore) return;

            // --- PROCESSING ---
            const uniqueIds = new Set<string>();
            const rowDataList: { invoiceId: string, advance: number, factoringFee: number }[] = [];

            dataRows.forEach((row) => {
                if (!Array.isArray(row)) return;

                const invoiceIdVal = row[idxInvoice];
                const invoiceId = String(invoiceIdVal || "").trim();

                // Helper parse
                const parseCurrency = (val: any) => {
                    if (typeof val === 'number') return val;
                    if (typeof val === 'string') {
                        if (!val.trim()) return 0;
                        const parsed = parseFloat(val.replace(/[^0-9.-]+/g, ""));
                        return isNaN(parsed) ? 0 : parsed;
                    }
                    return 0;
                };

                if (invoiceId && invoiceId.length > 1) {
                    uniqueIds.add(invoiceId);

                    // Robust Fee Extraction:
                    // Primary: Check exact index
                    // Fallback: Check index - 1 (Left Shift) - Common with trailing columns
                    let feeVal = parseCurrency(row[idxFee]);

                    if ((feeVal === 0 || row[idxFee] === undefined) && idxFee > 0) {
                        const leftVal = parseCurrency(row[idxFee - 1]);
                        if (leftVal !== 0) {
                            feeVal = leftVal;
                        }
                    }

                    rowDataList.push({
                        invoiceId,
                        advance: idxAdvance !== -1 ? parseCurrency(row[idxAdvance]) : 0,
                        factoringFee: feeVal
                    });
                }
            });

            const allIds = Array.from(uniqueIds);
            const loadMap = new Map<string, Load & { id: string }>(); // Map invoiceId/loadNumber -> Load

            // Firestore 'IN' limit is 30
            const CHUNK_SIZE = 30;
            const chunks = [];
            for (let i = 0; i < allIds.length; i += CHUNK_SIZE) {
                chunks.push(allIds.slice(i, i + CHUNK_SIZE));
            }

            toast({ title: "Processing Data", description: `Matching ${allIds.length} unique records in ${chunks.length} batches...` });

            // Process chunks sequentially to be kind to the connection limit
            for (let i = 0; i < chunks.length; i++) {
                const chunk = chunks[i];
                // Run two queries in parallel for this chunk: one for invoiceId, one for loadNumber
                const q1 = query(collection(firestore, 'loads'), where('invoiceId', 'in', chunk));
                const q2 = query(collection(firestore, 'loads'), where('loadNumber', 'in', chunk));

                try {
                    const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);

                    snap1.forEach(doc => {
                        const data = doc.data() as Load;
                        const load = { ...data, id: doc.id };
                        if (data.invoiceId) loadMap.set(data.invoiceId, load);
                    });

                    snap2.forEach(doc => {
                        const data = doc.data() as Load;
                        const load = { ...data, id: doc.id };
                        if (data.loadNumber) loadMap.set(data.loadNumber, load);
                    });
                } catch (err) {
                    console.error("Error processing chunk", i, err);
                }
            }

            // Now match cleanly from memory
            const matchedRecords: MatchedRecord[] = rowDataList.map(row => {
                // Try looking up by invoiceId as-is
                let foundLoad = loadMap.get(row.invoiceId);

                return {
                    invoiceId: row.invoiceId,
                    advance: row.advance,
                    factoringFee: row.factoringFee,
                    loadId: foundLoad?.id,
                    loadNumber: foundLoad?.loadNumber || foundLoad?.invoiceId,
                    status: foundLoad ? 'matched' : 'unmatched'
                } as MatchedRecord;
            });

            console.log("Matched results:", matchedRecords.length);
            setPreviewData(matchedRecords);

            if (matchedRecords.length === 0) {
                toast({ title: "No Data", description: "No valid rows extracted.", variant: "warning" });
            } else {
                const matchedCount = matchedRecords.filter(r => r.status === 'matched').length;
                toast({ title: "File Parsed", description: `Processed ${matchedRecords.length} rows. Found ${matchedCount} matches.` });
            }

        } catch (error) {
            console.error(error);
            toast({
                title: "Error Parsing File",
                description: "Errors occurred during processing. Check console.",
                variant: "destructive"
            });
        } finally {
            setProcessing(false);
            e.target.value = ''; // Reset input
        }
    };

    // 3. Commit Updates
    const handleImport = async () => {
        if (!firestore) return;
        setUploading(true);

        try {
            const batch = writeBatch(firestore);
            const matched = previewData.filter(r => r.status === 'matched' && r.loadId);

            // Firestore limit is 500 ops per batch.
            const BATCH_SIZE = 450;
            const recordsToUpdate = matched;

            let batchIndex = 0;
            while (batchIndex < recordsToUpdate.length) {
                const batchChunk = recordsToUpdate.slice(batchIndex, batchIndex + BATCH_SIZE);
                const currentBatch = writeBatch(firestore);

                batchChunk.forEach(record => {
                    if (!record.loadId) return;
                    const loadRef = doc(firestore, 'loads', record.loadId);
                    currentBatch.update(loadRef, {
                        advance: record.advance,
                        factoringFee: record.factoringFee
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
            setFile(null);
            setPreviewData([]);


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

    const stats = {
        total: previewData.length,
        matched: previewData.filter(r => r.status === 'matched').length,
        unmatched: previewData.filter(r => r.status === 'unmatched').length,
    };

    return (
        <div className="p-6 space-y-8 max-w-5xl mx-auto">
            <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-bold tracking-tight">Factoring Import</h1>
                <p className="text-muted-foreground">Import Factoring Reports to update load financials.</p>
            </div>

            {/* Upload Section */}
            {!previewData.length ? (
                <Card className="border-dashed border-2">
                    <CardHeader>
                        <CardTitle>Upload Factoring Report</CardTitle>
                        <CardDescription>Upload an Excel (.xlsx) file with columns: Invoice Number, Advance Amount, Total Fee</CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col items-center justify-center p-12 gap-4">
                        <div className="p-4 bg-muted/50 rounded-full">
                            <Upload className="h-8 w-8 text-muted-foreground" />
                        </div>
                        <div className="flex flex-col items-center gap-2">
                            <Button disabled={processing} className="relative">
                                {processing ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Scanning file...
                                    </>
                                ) : (
                                    "Select Excel File"
                                )}
                                <input
                                    type="file"
                                    accept=".xlsx, .xls, .csv"
                                    className="absolute inset-0 opacity-0 cursor-pointer"
                                    onChange={handleFileUpload}
                                    disabled={processing}
                                />
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-6">
                    {/* Stats */}
                    <div className="grid grid-cols-3 gap-4">
                        <Card>
                            <CardHeader className="p-4 pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Total Rows</CardTitle></CardHeader>
                            <CardContent className="p-4 pt-0"><div className="text-2xl font-bold">{stats.total}</div></CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="p-4 pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Matched Loads</CardTitle></CardHeader>
                            <CardContent className="p-4 pt-0"><div className="text-2xl font-bold text-green-600">{stats.matched}</div></CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="p-4 pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Unmatched</CardTitle></CardHeader>
                            <CardContent className="p-4 pt-0"><div className="text-2xl font-bold text-red-600">{stats.unmatched}</div></CardContent>
                        </Card>
                    </div>

                    {/* Preview Table */}
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between">
                            <div>
                                <CardTitle>Preview Data</CardTitle>
                                <CardDescription>Review the matches before importing.</CardDescription>
                            </div>
                            <div className="flex gap-2">
                                <Button variant="outline" onClick={() => { setPreviewData([]); setFile(null); }}>Cancel</Button>
                                <Button onClick={handleImport} disabled={uploading || stats.matched === 0}>
                                    {uploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    Import {stats.matched} Records
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Status</TableHead>
                                        <TableHead>Invoice #</TableHead>
                                        <TableHead>Load Found</TableHead>
                                        <TableHead className="text-right">Advance</TableHead>
                                        <TableHead className="text-right">Factor Fee</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {previewData.slice(0, 50).map((row, i) => (
                                        <TableRow key={i}>
                                            <TableCell>
                                                {row.status === 'matched' ? (
                                                    <div className="flex items-center text-green-600 gap-2">
                                                        <CheckCircle className="h-4 w-4" /> Matched
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center text-red-500 gap-2">
                                                        <AlertCircle className="h-4 w-4" /> Unmatched
                                                    </div>
                                                )}
                                            </TableCell>
                                            <TableCell className="font-medium">{row.invoiceId}</TableCell>
                                            <TableCell className="text-muted-foreground">{row.loadNumber || '-'}</TableCell>
                                            <TableCell className="text-right">
                                                {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(row.advance)}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(row.factoringFee)}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {previewData.length > 50 && (
                                        <TableRow>
                                            <TableCell colSpan={5} className="text-center text-muted-foreground">
                                                ... and {previewData.length - 50} more rows
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>
    );
}
