"use client";

import { useState } from "react";
import { Upload, FileText, Loader2, CheckCircle, AlertCircle, ChevronDown, ChevronUp, Truck, Scale } from "lucide-react";
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

function ReceiptCard({ receipt }: { receipt: ReceiptData }) {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <Card className="mb-4 border-l-4 border-l-primary">
            <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                    <div>
                        <CardTitle className="text-lg font-bold">{receipt.vendor_name || "Unknown Vendor"}</CardTitle>
                        <CardDescription>{receipt.vendor_location}</CardDescription>
                    </div>
                    <div className="text-right">
                        <div className="text-xl font-bold text-green-600">${receipt.total_amount || "0.00"}</div>
                        <Badge variant="outline" className="mt-1 capitalize">{receipt.receipt_type?.replace('_', ' ')}</Badge>
                    </div>
                </div>
                <div className="flex gap-4 text-sm text-muted-foreground mt-2">
                    <div className="flex items-center gap-1"><FileText className="h-3 w-3" /> {receipt.receipt_number || "N/A"}</div>
                    <div>{receipt.transaction_date} {receipt.transaction_time}</div>
                </div>
            </CardHeader>
            <CardContent>
                <Collapsible open={isOpen} onOpenChange={setIsOpen}>
                    <div className="flex items-center justify-between mt-2">
                        <span className="text-sm font-medium">Details</span>
                        <CollapsibleTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            </Button>
                        </CollapsibleTrigger>
                    </div>
                    <CollapsibleContent className="space-y-4 pt-4">
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

                        {/* Line Items */}
                        {receipt.line_items && receipt.line_items.length > 0 && (
                            <div className="border rounded-md overflow-hidden">
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
                    </CollapsibleContent>
                </Collapsible>
            </CardContent>
        </Card>
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

    return (
        <div className="container mx-auto py-10 px-4 max-w-4xl">
            <div className="flex items-center gap-3 mb-6">
                <Truck className="h-8 w-8 text-primary" />
                <h1 className="text-3xl font-bold text-foreground">Document Analysis</h1>
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
                    {results.map((res, index) => (
                        <div key={index} className="space-y-4">
                            <h2 className="text-xl font-semibold flex items-center gap-2 border-b pb-2">
                                {res.error ? <AlertCircle className="h-5 w-5 text-red-500" /> : <CheckCircle className="h-5 w-5 text-green-500" />}
                                Results for {res.file}
                            </h2>

                            {res.error ? (
                                <div className="p-4 bg-red-50 text-red-600 rounded-md border border-red-200">
                                    Error: {res.error}
                                </div>
                            ) : (
                                <div className="grid gap-4">
                                    {res.receipts.length === 0 ? (
                                        <p className="text-muted-foreground italic">No receipts found in this image.</p>
                                    ) : (
                                        res.receipts.map((receipt, rIdx) => (
                                            <ReceiptCard key={rIdx} receipt={receipt} />
                                        ))
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
