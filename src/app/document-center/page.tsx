"use client";

import { useState } from "react";
import { Upload, FileText, Loader2, CheckCircle, AlertCircle, ChevronDown, ChevronUp, Truck, Scale, Pencil, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useFunctions } from "@/firebase/provider";
import { httpsCallable } from "firebase/functions";

interface LineItem {
    description: string;
    quantity: string | number;
    unit_price: string | number;
    line_total: string | number;
    category: string;
}

interface CatScaleData {
    gross_weight: string;
    axle_weights: string | string[];
    scale_id: string;
    truck_info: string;
}

interface ReceiptData {
    receipt_type: string;
    receipt_number: string;
    transaction_date: string;
    transaction_time: string;
    vendor_name: string;
    vendor_location: string;
    unit_id?: string;
    payment_method: string;
    subtotal: string | number;
    tax: string | number;
    total_amount: string | number;
    line_items: LineItem[];
    cat_scale_data?: CatScaleData;
    notes: string;
}

interface AnalysisResult {
    file: string;
    receipts: ReceiptData[];
    error?: string;
}

function ReceiptRow({ receipt, onUpdateUnitId }: { receipt: ReceiptData, onUpdateUnitId: (newUnitId: string) => void }) {
    const [isOpen, setIsOpen] = useState(false);
    const [isEditingUnit, setIsEditingUnit] = useState(false);
    const [tempUnitId, setTempUnitId] = useState(receipt.unit_id || "");

    const handleSaveUnitId = () => {
        onUpdateUnitId(tempUnitId);
        setIsEditingUnit(false);
    };

    const handleCancelEdit = () => {
        setTempUnitId(receipt.unit_id || "");
        setIsEditingUnit(false);
    };

    // Derived description
    const description = receipt.notes ||
        (receipt.line_items?.length > 0 ? `${receipt.line_items.length} items` : receipt.receipt_type?.replace('_', ' '));

    return (
        <>
            <TableRow className="hover:bg-muted/50 cursor-pointer" onClick={() => !isEditingUnit && setIsOpen(!isOpen)}>
                <TableCell className="font-medium align-top py-4">
                    <div className="flex flex-col">
                        <span>{receipt.transaction_date || "N/A"}</span>
                        <span className="text-xs text-muted-foreground">{receipt.transaction_time}</span>
                    </div>
                </TableCell>
                <TableCell className="align-top py-4" onClick={(e) => e.stopPropagation()}>
                    {isEditingUnit ? (
                        <div className="flex items-center gap-2">
                            <Input
                                value={tempUnitId}
                                onChange={(e) => setTempUnitId(e.target.value)}
                                className="h-8 w-24"
                                autoFocus
                            />
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-green-600" onClick={handleSaveUnitId}>
                                <Save className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600" onClick={handleCancelEdit}>
                                <X className="h-4 w-4" />
                            </Button>
                        </div>
                    ) : (
                        <div className="flex items-center gap-2 group">
                            {receipt.unit_id ? (
                                <Badge variant="outline" className="font-mono">{receipt.unit_id}</Badge>
                            ) : (
                                <Badge variant="destructive" className="opacity-80 hover:opacity-100">Unassigned</Badge>
                            )}
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={() => setIsEditingUnit(true)}
                            >
                                <Pencil className="h-3 w-3" />
                            </Button>
                        </div>
                    )}
                </TableCell>
                <TableCell className="align-top py-4">
                    <div className="flex flex-col">
                        <span className="font-semibold">{receipt.vendor_name || "Unknown Vendor"}</span>
                        <span className="text-xs text-muted-foreground">{receipt.vendor_location}</span>
                    </div>
                </TableCell>
                <TableCell className="align-top py-4">
                    <span className="text-sm line-clamp-2">{description}</span>
                </TableCell>
                <TableCell className="text-right align-top py-4 font-bold text-green-600">
                    ${receipt.total_amount || "0.00"}
                </TableCell>
                <TableCell className="text-right align-top py-4">
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                        {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </Button>
                </TableCell>
            </TableRow>
            {isOpen && (
                <TableRow className="bg-muted/10">
                    <TableCell colSpan={6} className="p-0 border-b">
                        <div className="p-4 space-y-4">
                            {/* Detailed View - Similar to previous ReceiptCard content */}
                            <div className="grid md:grid-cols-2 gap-4">
                                <div>
                                    <h4 className="font-semibold text-sm mb-2">Transaction Details</h4>
                                    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                                        <dt className="text-muted-foreground">Receipt #</dt>
                                        <dd>{receipt.receipt_number || "N/A"}</dd>
                                        <dt className="text-muted-foreground">Type</dt>
                                        <dd className="capitalize">{receipt.receipt_type?.replace('_', ' ')}</dd>
                                        <dt className="text-muted-foreground">Payment</dt>
                                        <dd>{receipt.payment_method}</dd>
                                        <dt className="text-muted-foreground">Subtotal</dt>
                                        <dd>${receipt.subtotal}</dd>
                                        <dt className="text-muted-foreground">Tax</dt>
                                        <dd>${receipt.tax}</dd>
                                    </dl>
                                </div>

                                {/* CAT Scale Data */}
                                {receipt.cat_scale_data && (receipt.cat_scale_data.gross_weight || receipt.cat_scale_data.scale_id) && (
                                    <div className="bg-muted/30 p-3 rounded-md border border-border/50">
                                        <h4 className="flex items-center gap-2 font-semibold mb-2 text-sm"><Scale className="h-4 w-4" /> CAT Scale Info</h4>
                                        <div className="grid grid-cols-2 gap-2 text-sm">
                                            <div><span className="text-muted-foreground">Gross Wt:</span> {receipt.cat_scale_data.gross_weight}</div>
                                            <div><span className="text-muted-foreground">Scale ID:</span> {receipt.cat_scale_data.scale_id}</div>
                                            <div className="col-span-2"><span className="text-muted-foreground">Axles:</span> {Array.isArray(receipt.cat_scale_data.axle_weights) ? receipt.cat_scale_data.axle_weights.join(', ') : receipt.cat_scale_data.axle_weights}</div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Line Items */}
                            {receipt.line_items && receipt.line_items.length > 0 && (
                                <div className="border rounded-md overflow-hidden bg-background">
                                    <Table>
                                        <TableHeader>
                                            <TableRow className="bg-muted/50">
                                                <TableHead className="py-2 h-8">Item</TableHead>
                                                <TableHead className="py-2 h-8 text-right">Qty</TableHead>
                                                <TableHead className="py-2 h-8 text-right">Price</TableHead>
                                                <TableHead className="py-2 h-8 text-right">Total</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {receipt.line_items.map((item, idx) => (
                                                <TableRow key={idx}>
                                                    <TableCell className="py-2 font-medium text-xs">{item.description} <Badge variant="secondary" className="ml-2 text-[10px] h-4 px-1">{item.category}</Badge></TableCell>
                                                    <TableCell className="py-2 text-xs text-right">{item.quantity}</TableCell>
                                                    <TableCell className="py-2 text-xs text-right">{item.unit_price}</TableCell>
                                                    <TableCell className="py-2 text-xs text-right">{item.line_total}</TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            )}

                            {receipt.notes && (
                                <div className="text-sm text-muted-foreground italic bg-yellow-50 dark:bg-yellow-900/10 p-2 rounded border border-yellow-200 dark:border-yellow-900/30">
                                    Note: {receipt.notes}
                                </div>
                            )}
                        </div>
                    </TableCell>
                </TableRow>
            )}
        </>
    );
}

export default function AnalyzeDocsPage() {
    const [files, setFiles] = useState<FileList | null>(null);
    const [results, setResults] = useState<AnalysisResult[]>([]);
    const [loading, setLoading] = useState(false);

    // Get functions instance
    const functions = useFunctions();

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            setFiles(e.target.files);
            setResults([]);
        }
    };

    const handleAnalyze = async () => {
        if (!files) return;

        setLoading(true);
        const newResults: AnalysisResult[] = [];

        // Prepare the callable function
        const analyzeDocs = httpsCallable(functions, 'analyzeDocs');

        for (let i = 0; i < files.length; i++) {
            const file = files[i];

            try {
                // Convert to base64
                const arrayBuffer = await file.arrayBuffer();
                const base64String = Buffer.from(arrayBuffer).toString('base64');

                // Call Cloud Function
                const result = await analyzeDocs({ base64Image: base64String });
                const data = result.data as any;

                newResults.push({
                    file: file.name,
                    receipts: data.receipts || [],
                });
            } catch (err: any) {
                console.error("Analysis Error", err);
                newResults.push({
                    file: file.name,
                    receipts: [],
                    error: err.message || "Unknown error",
                });
            }
        }

        setResults(newResults);
        setLoading(false);
    };

    const updateReceiptUnitId = (fileIndex: number, receiptIndex: number, newUnitId: string) => {
        setResults(prev => {
            const next = [...prev];
            next[fileIndex].receipts[receiptIndex].unit_id = newUnitId;
            return next;
        });
    };

    return (
        <div className="container mx-auto py-10 px-4 max-w-6xl">
            <div className="flex items-center gap-3 mb-6">
                <Truck className="h-8 w-8 text-primary" />
                <h1 className="text-3xl font-bold text-foreground">Document Center</h1>
            </div>

            <Card className="mb-8 border-dashed border-2 shadow-none bg-muted/20">
                <CardHeader>
                    <CardTitle>Upload Documents</CardTitle>
                    <CardDescription>
                        Select images (Receipts, Scale Tickets, Combos). Our AI will extract all details suitable for IRS compliance.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid w-full items-center gap-4">
                        <div className="flex flex-col space-y-1.5">
                            <Label htmlFor="doc-upload">Files</Label>
                            <Input
                                id="doc-upload"
                                type="file"
                                multiple
                                onChange={handleFileChange}
                                accept="image/*"
                                className="cursor-pointer bg-background"
                            />
                        </div>
                    </div>
                </CardContent>
                <CardFooter className="flex justify-end">
                    <Button onClick={handleAnalyze} disabled={!files || loading} size="lg">
                        {loading ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Processing with AI...
                            </>
                        ) : (
                            <>
                                <Upload className="mr-2 h-4 w-4" />
                                Analyze Docs
                            </>
                        )}
                    </Button>
                </CardFooter>
            </Card>

            {results.length > 0 && (
                <div className="space-y-8">
                    {/* Flat list of all extracted items? Or grouped by file? 
                        User asked for "The page should display all the extracted data".
                        Grouped by file is usually safer for context, but table structure implies a flat list feels better.
                        However, let's keep grouped by file for now to show context of errors/success per file.
                    */}
                    {results.map((res, fileIndex) => (
                        <Card key={fileIndex} className="overflow-hidden">
                            <CardHeader className="bg-muted/10 border-b py-3">
                                <CardTitle className="text-base flex items-center gap-2">
                                    {res.error ? <AlertCircle className="h-4 w-4 text-red-500" /> : <CheckCircle className="h-4 w-4 text-green-500" />}
                                    {res.file}
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-0">
                                {res.error ? (
                                    <div className="p-4 bg-red-50 text-red-600">
                                        Error: {res.error}
                                    </div>
                                ) : (
                                    res.receipts.length === 0 ? (
                                        <div className="p-8 text-center text-muted-foreground italic">No receipts found in this image.</div>
                                    ) : (
                                        <Table>
                                            <TableHeader>
                                                <TableRow className="bg-muted/50">
                                                    <TableHead className="w-[120px]">Date</TableHead>
                                                    <TableHead className="w-[150px]">Unit ID</TableHead>
                                                    <TableHead>Vendor</TableHead>
                                                    <TableHead className="w-[30%]">Description</TableHead>
                                                    <TableHead className="text-right">Total</TableHead>
                                                    <TableHead className="w-[50px]"></TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {res.receipts.map((receipt, rIdx) => (
                                                    <ReceiptRow
                                                        key={rIdx}
                                                        receipt={receipt}
                                                        onUpdateUnitId={(newId) => updateReceiptUnitId(fileIndex, rIdx, newId)}
                                                    />
                                                ))}
                                            </TableBody>
                                        </Table>
                                    )
                                )}
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}
