"use client";

import { useState, useRef } from "react";
import { Upload, FileText, Loader2, CheckCircle, AlertCircle, ChevronDown, ChevronUp, Truck, Scale, Pencil, Save, X, Eye, Trash2, CloudUpload, Image as ImageIcon } from "lucide-react";
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
import { useFunctions, useFirestore, useStorage, useUser } from "@/firebase/provider";
import { httpsCallable } from "firebase/functions";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { collection, addDoc, serverTimestamp, query, where, orderBy } from "firebase/firestore";
import { useCollection } from "@/firebase/firestore/use-collection";
import { useMemoFirebase } from "@/firebase/provider";
import { getDocs, limit, updateDoc, doc, deleteDoc } from "firebase/firestore";
import { Switch } from "@/components/ui/switch";
import { WithId } from "@/lib/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";



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
    expenseOwner?: string;
    relatedExpenseId?: string; // New field to link to expenses collection
    reimbursable?: boolean;
    imageUrl?: string;
    allImageUrls?: string[];
}

interface AnalysisResult {
    id: string; // New: Unique ID for state tracking
    file: string;
    receipts: ReceiptData[];
    error?: string;
    loading?: boolean; // New: Local loading state
}

function ReceiptRow({ receipt, availableUnitIds, onUpdateUnitId, onToggleReimbursable, onPreview, onDelete }: {
    receipt: WithId<ReceiptData>,
    availableUnitIds: string[],
    onUpdateUnitId: (newUnitId: string) => void,
    onToggleReimbursable: (val: boolean) => void,
    onPreview: () => void,
    onDelete: () => void
}) {
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
                            <Select
                                value={tempUnitId}
                                onValueChange={setTempUnitId}
                            >
                                <SelectTrigger className="h-8 w-[140px]">
                                    <SelectValue placeholder="Select Unit ID" />
                                </SelectTrigger>
                                <SelectContent>
                                    <div className="max-h-[200px] overflow-y-auto">
                                        {availableUnitIds.map((id) => (
                                            <SelectItem key={id} value={id}>
                                                {id}
                                            </SelectItem>
                                        ))}
                                    </div>
                                </SelectContent>
                            </Select>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-green-600" onClick={handleSaveUnitId}>
                                <Save className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600" onClick={handleCancelEdit}>
                                <X className="h-4 w-4" />
                            </Button>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-2 items-start group">
                            <div className="flex items-center gap-2">
                                {receipt.unit_id ? (
                                    <Badge variant="outline" className="font-mono bg-muted/50 text-foreground border-border/50">{receipt.unit_id}</Badge>
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
                        </div>
                    )}
                </TableCell>
                <TableCell className="align-top py-4">
                    {receipt.expenseOwner ? (
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/30 px-2 py-1 rounded-md border border-border/30 w-fit">
                            <span className="font-medium text-foreground">{receipt.expenseOwner}</span>
                        </div>
                    ) : (
                        <span className="text-xs text-muted-foreground italic">-</span>
                    )}
                </TableCell>
                <TableCell className="align-top py-4">
                    <div className="flex flex-col">
                        <span className="font-semibold">{receipt.vendor_name || "Unknown Vendor"}</span>
                        <span className="text-xs text-muted-foreground">{receipt.vendor_location}</span>
                    </div>
                </TableCell>

                <TableCell className="text-right align-top py-4 font-bold text-green-600">
                    ${receipt.total_amount || "0.00"}
                </TableCell>
                <TableCell className="text-right align-top py-4">
                    <div className="flex flex-col items-end gap-2">
                        <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                            {/* Reimburse Switch */}
                            <div className="flex items-center space-x-2 mr-2">
                                <Label htmlFor={`reimburse-${receipt.id}`} className="text-xs text-muted-foreground whitespace-nowrap hidden sm:inline-block cursor-pointer">
                                    Reimburse
                                </Label>
                                <Switch
                                    id={`reimburse-${receipt.id}`}
                                    checked={receipt.reimbursable || false}
                                    onCheckedChange={(checked) => onToggleReimbursable(checked)}
                                    className="scale-90"
                                />
                            </div>

                            {/* Action Buttons */}
                            <div className="flex items-center bg-muted/30 rounded-full p-1 border border-border/30">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 rounded-full text-blue-600 hover:text-blue-700 hover:bg-blue-100/50"
                                    onClick={onPreview}
                                    title="View Image"
                                >
                                    <Eye className="h-4 w-4" />
                                </Button>
                                <div className="w-px h-4 bg-border/50 mx-0.5"></div>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 rounded-full text-red-600 hover:text-red-700 hover:bg-red-100/50"
                                    onClick={onDelete}
                                    title="Delete Receipt"
                                >
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>

                        {/* Expand Button */}
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-8 rounded-full hover:bg-muted/50 flex items-center justify-center p-0 mt-2"
                            onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); }}
                        >
                            {isOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                        </Button>
                    </div>
                </TableCell>
            </TableRow>
            {isOpen && (
                <TableRow className="bg-muted/10">
                    <TableCell colSpan={6} className="p-0 border-b">
                        <div className="p-4 space-y-4">
                            {/* Detailed View - Similar to previous ReceiptCard content */}
                            <div className="grid md:grid-cols-2 gap-4">
                                <div>
                                    <h4 className="font-semibold text-sm mb-3">Transaction Details</h4>
                                    <div className="space-y-3">
                                        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                                            <div className="text-muted-foreground">Type</div>
                                            <div className="capitalize font-medium">{receipt.receipt_type?.replace('_', ' ')}</div>

                                            <div className="text-muted-foreground">Total</div>
                                            <div className="font-medium text-green-600">${receipt.total_amount}</div>

                                            <div className="text-muted-foreground">Payment</div>
                                            <div>{receipt.payment_method}</div>
                                        </div>

                                        <div className="pt-2 border-t">
                                            <h5 className="text-xs font-semibold text-muted-foreground mb-1">Description</h5>
                                            <p className="text-sm">{description}</p>
                                        </div>
                                    </div>
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
    // State for pending uploads/analysis
    interface PendingItem {
        id: string;
        fileName: string;
        status: 'uploading' | 'analyzing' | 'error';
        error?: string;
    }

    const [files, setFiles] = useState<File[]>([]);
    const [isDragging, setIsDragging] = useState(false);
    const [pendingItems, setPendingItems] = useState<PendingItem[]>([]);

    // Preview & Delete State
    const [previewReceipt, setPreviewReceipt] = useState<WithId<ReceiptData> | null>(null);
    const [receiptToDelete, setReceiptToDelete] = useState<WithId<ReceiptData> | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);

    // Get functions, firestore, storage, user instance
    const functions = useFunctions();
    const firestore = useFirestore();
    const storage = useStorage();
    const { user } = useUser();

    // Query for saved receipts
    const receiptsQuery = useMemoFirebase(
        () => {
            if (!user || !firestore) return null;
            return query(
                collection(firestore, "receipts"),
                where("userId", "==", user.uid),
                orderBy("createdAt", "desc")
            );
        },
        [user, firestore]
    );



    const { data: savedReceipts, loading: loadingReceipts } = useCollection<ReceiptData>(receiptsQuery);

    // Fetch Unit IDs (Owners & Drivers) for Dropdown
    const ownersQuery = useMemoFirebase(() => {
        if (!firestore) return null;
        return query(collection(firestore, "owners"));
    }, [firestore]);
    const { data: owners } = useCollection<any>(ownersQuery);

    const driversQuery = useMemoFirebase(() => {
        if (!firestore) return null;
        return query(collection(firestore, "drivers"));
    }, [firestore]);
    const { data: drivers } = useCollection<any>(driversQuery);

    // Compute unique Unit IDs
    const availableUnitIds = Array.from(new Set([
        ...(owners?.map(o => o.unitId).filter(Boolean) || []),
        ...(drivers?.map(d => d.unitId).filter(Boolean) || [])
    ])).sort();


    const convertFileToBase64 = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => {
                const base64String = (reader.result as string).split(',')[1];
                resolve(base64String);
            };
            reader.onerror = (error) => reject(error);
        });
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            setFiles(prev => [...prev, ...Array.from(e.target.files || [])]);
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            setFiles(prev => [...prev, ...Array.from(e.dataTransfer.files)]);
        }
    };

    const removeFile = (index: number) => {
        setFiles(prev => prev.filter((_, i) => i !== index));
    };

    const processBatch = async () => {
        if (!files || files.length === 0) return;

        // Generate IDs and initial pending items
        const newItems: PendingItem[] = files.map(file => ({
            id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            fileName: file.name,
            status: 'uploading'
        }));

        setPendingItems(prev => [...newItems, ...prev]);

        // Keep a reference to current files and clear state immediately
        const currentFiles = [...files];
        setFiles([]); // Clear selection UI

        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }

        const analyzeDocs = httpsCallable(functions, 'analyzeDocs');

        try {
            const base64Images: string[] = [];
            const uploadedFileDetails: { url: string; path: string; name: string }[] = [];

            // 1. Upload & Read
            for (let i = 0; i < currentFiles.length; i++) {
                const file = currentFiles[i];
                const itemId = newItems[i].id;

                // Update status to uploading if not already
                setPendingItems(prev => prev.map(item =>
                    item.id === itemId ? { ...item, status: 'uploading' } : item
                ));

                // Read Base64
                const arrayBuffer = await file.arrayBuffer();
                const base64String = Buffer.from(arrayBuffer).toString('base64');
                base64Images.push(base64String);

                if (user && storage) {
                    const storagePath = `receipts/${user.uid}/${Date.now()}_${i}_${file.name}`;
                    const storageRef = ref(storage, storagePath);
                    await uploadBytes(storageRef, file);
                    const downloadURL = await getDownloadURL(storageRef);
                    uploadedFileDetails.push({ url: downloadURL, path: storagePath, name: file.name });
                }
            }
            if (base64Images.length === 0) {
                throw new Error("Failed to process any images from the selection.");
            }

            // Update all to analyzing
            setPendingItems(prev => prev.map(item =>
                newItems.some(n => n.id === item.id) ? { ...item, status: 'analyzing' } : item
            ));

            // 2. Analyze
            const result = await analyzeDocs({ images: base64Images });
            const data = result.data as any;
            const extractedReceipts: ReceiptData[] = data.receipts || [];

            // 3. Save
            if (user && firestore && extractedReceipts.length > 0) {
                for (let i = 0; i < extractedReceipts.length; i++) {
                    const receipt = extractedReceipts[i];
                    const fileDetails = uploadedFileDetails[i] || null;

                    // Lookup Owner/Driver if Unit ID exists
                    let expenseOwner = null;
                    let expenseType: 'company' | 'driver' | 'owner' = 'company';
                    let matchedDriverId = null;
                    let matchedOwnerId = null;

                    if (receipt.unit_id) {
                        const cleanUnitId = receipt.unit_id.trim();

                        // 1. Check Owners
                        const qOwner = query(
                            collection(firestore, "owners"),
                            where("unitId", "==", cleanUnitId),
                            limit(1)
                        );
                        const snapOwner = await getDocs(qOwner);
                        if (!snapOwner.empty) {
                            expenseOwner = snapOwner.docs[0].data().name;
                            matchedOwnerId = snapOwner.docs[0].id;
                            expenseType = 'owner';
                        }

                        // 2. Check Drivers
                        const qDriver = query(
                            collection(firestore, "drivers"),
                            where("unitId", "==", cleanUnitId),
                            limit(1)
                        );
                        const snapDriver = await getDocs(qDriver);
                        if (!snapDriver.empty) {
                            matchedDriverId = snapDriver.docs[0].id;
                            // Only switch to driver billing if NO owner exists
                            if (!matchedOwnerId) {
                                const driverData = snapDriver.docs[0].data();
                                expenseOwner = `${driverData.firstName} ${driverData.lastName}`;
                                expenseType = 'driver';
                            }
                        }
                    }

                    // Create Expense Document
                    let expenseId = null;
                    try {
                        const expenseDoc = await addDoc(collection(firestore, "expenses"), {
                            description: receipt.vendor_name || "Receipt Expense",
                            amount: typeof receipt.total_amount === 'number' ? receipt.total_amount : parseFloat(String(receipt.total_amount).replace(/[^0-9.]/g, '') || '0'),
                            date: receipt.transaction_date || new Date().toISOString().split('T')[0],
                            type: expenseType,
                            unitId: receipt.unit_id || null,
                            driverId: matchedDriverId,
                            ownerId: matchedOwnerId,
                            category: 'deduction',
                            expenseCategory: 'Receipt',
                            createdAt: serverTimestamp()
                        });
                        expenseId = expenseDoc.id;
                    } catch (e) {
                        console.error("Failed to create expense doc:", e);
                    }

                    await addDoc(collection(firestore, "receipts"), {
                        ...receipt,
                        userId: user.uid,
                        expenseOwner: expenseOwner,
                        relatedExpenseId: expenseId,
                        imageUrl: fileDetails ? fileDetails.url : null,
                        storagePath: fileDetails ? fileDetails.path : null,
                        originalFileName: fileDetails ? fileDetails.name : "upload",
                        allImageUrls: fileDetails ? [fileDetails.url] : [],
                        allStoragePaths: fileDetails ? [fileDetails.path] : [],
                        analyzedAt: serverTimestamp(),
                        createdAt: serverTimestamp()
                    });
                }
            }

            // Remove from pending (Success)
            setPendingItems(prev => prev.filter(item => !newItems.some(n => n.id === item.id)));

        } catch (err: any) {
            console.error("Analysis Error", err);
            // Update status to error
            setPendingItems(prev => prev.map(item =>
                newItems.some(n => n.id === item.id)
                    ? { ...item, status: 'error', error: err.message || "Unknown error" }
                    : item
            ));
        }
    };

    const dismissError = (itemId: string) => {
        setPendingItems(prev => prev.filter(i => i.id !== itemId));
    };

    const updateReceiptUnitId = async (receiptId: string, newUnitId: string, relatedExpenseId?: string) => {
        if (!firestore || !user) return;

        try {
            // Lookup new owner/driver
            let newOwner = null;
            let newType = 'company';
            let newDriverId = null;
            let newOwnerId = null;

            if (newUnitId) {
                const cleanId = newUnitId.trim();

                // Check Owner
                const qObs = query(collection(firestore, "owners"), where("unitId", "==", cleanId), limit(1));
                const snapObs = await getDocs(qObs);
                if (!snapObs.empty) {
                    newOwner = snapObs.docs[0].data().name;
                    newOwnerId = snapObs.docs[0].id;
                    newType = 'owner';
                }

                // Check Driver (Link driver but only override type if no owner)
                const qDrv = query(collection(firestore, "drivers"), where("unitId", "==", cleanId), limit(1));
                const snapDrv = await getDocs(qDrv);
                if (!snapDrv.empty) {
                    const dData = snapDrv.docs[0].data();
                    newDriverId = snapDrv.docs[0].id; // Always link driver

                    if (!newOwnerId) {
                        newOwner = `${dData.firstName} ${dData.lastName}`;
                        newType = 'driver';
                    }
                }
            }

            // Update Doc
            await updateDoc(doc(firestore, "receipts", receiptId), {
                unit_id: newUnitId,
                expenseOwner: newOwner
            });

            // Update Linked Expense
            if (relatedExpenseId) {
                await updateDoc(doc(firestore, "expenses", relatedExpenseId), {
                    unitId: newUnitId,
                    type: newType,
                    ownerId: newOwnerId,
                    driverId: newDriverId
                });
            }

        } catch (error) {
            console.error("Failed to update unit ID:", error);
        }
    };

    const toggleReimbursable = async (receipt: WithId<ReceiptData>, isReimbursable: boolean) => {
        if (!firestore || !receipt.id) return;
        try {
            // Update Receipt
            await updateDoc(doc(firestore, "receipts", receipt.id), {
                reimbursable: isReimbursable
            });

            // Update Expense
            if (receipt.relatedExpenseId) {
                await updateDoc(doc(firestore, "expenses", receipt.relatedExpenseId), {
                    reimbursable: isReimbursable
                });
            }
        } catch (err) {
            console.error("Failed to toggle reimbursable:", err);
        }
    };

    const confirmDelete = async () => {
        if (!firestore || !receiptToDelete) return;
        setIsDeleting(true);
        try {
            // Delete Receipt
            await deleteDoc(doc(firestore, "receipts", receiptToDelete.id));

            // Delete Expense if linked
            if (receiptToDelete.relatedExpenseId) {
                await deleteDoc(doc(firestore, "expenses", receiptToDelete.relatedExpenseId));
            }
        } catch (error) {
            console.error("Failed to delete receipt:", error);
        } finally {
            setIsDeleting(false);
            setReceiptToDelete(null);
        }
    };

    return (
        <div className="container mx-auto py-10 px-4 max-w-6xl">
            <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-3">
                    <Truck className="h-8 w-8 text-primary" />
                    <h1 className="text-3xl font-bold text-foreground">Document Center</h1>
                </div>
            </div>
            {/* Upload Section */}
            <div className={`grid md:grid-cols-5 gap-6 mb-12 transition-all duration-300 ease-in-out ${isDragging ? 'scale-[1.01]' : ''}`}>

                {/* 1. Drag & Drop Zone (Left - 3 cols) */}
                <Card
                    className={`md:col-span-3 border-2 border-dashed shadow-sm relative overflow-hidden transition-colors ${isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/20 hover:border-primary/50 hover:bg-muted/10'}`}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                >
                    <CardContent className="flex flex-col items-center justify-center p-10 h-full min-h-[300px] text-center space-y-4 cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                        <div className={`p-5 rounded-full bg-background shadow-sm ring-1 ring-border transition-transform duration-300 ${isDragging ? 'scale-110 ring-primary' : ''}`}>
                            <CloudUpload className={`h-10 w-10 ${isDragging ? 'text-primary' : 'text-muted-foreground'}`} />
                        </div>
                        <div className="space-y-1">
                            <h3 className="text-xl font-semibold tracking-tight">
                                {isDragging ? "Drop files now!" : "Upload Documents"}
                            </h3>
                            <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                                Drag and drop your receipts, scale tickets, or full invoices here.
                            </p>
                        </div>

                        <div className="flex items-center gap-2 w-full max-w-xs pt-4">
                            <div className="h-px bg-border flex-1" />
                            <span className="text-xs text-muted-foreground uppercase font-medium">Or</span>
                            <div className="h-px bg-border flex-1" />
                        </div>

                        <Button variant="secondary" className="mt-2 pointer-events-none">
                            Browse Files
                        </Button>

                        <Input
                            id="doc-upload"
                            type="file"
                            multiple
                            accept="image/*,application/pdf"
                            className="hidden"
                            onChange={handleFileChange}
                            ref={fileInputRef}
                        />
                    </CardContent>
                </Card>

                {/* 2. Staging & Analyze Area (Right - 2 cols) */}
                <Card className="md:col-span-2 flex flex-col h-full border shadow-sm">
                    <CardHeader className="pb-3 border-b bg-muted/5">
                        <CardTitle className="text-base font-medium flex justify-between items-center">
                            <span>Analysis Queue</span>
                            <Badge variant={files.length > 0 ? "default" : "secondary"} className="transition-all">
                                {files.length} Ready
                            </Badge>
                        </CardTitle>
                    </CardHeader>

                    <div className="flex-1 min-h-[220px] relative bg-background">
                        {files.length > 0 ? (
                            <ScrollArea className="h-full absolute inset-0">
                                <div className="p-4 space-y-3">
                                    {files.map((file, idx) => (
                                        <div key={idx} className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-accent/5 transition-colors group">
                                            <div className="h-12 w-12 bg-muted rounded-md border flex items-center justify-center shrink-0 overflow-hidden">
                                                {file.type.startsWith('image/') ? (
                                                    // eslint-disable-next-line @next/next/no-img-element
                                                    <img src={URL.createObjectURL(file)} alt="Preview" className="h-full w-full object-cover" />
                                                ) : (
                                                    <FileText className="h-6 w-6 text-muted-foreground" />
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0 pt-1">
                                                <p className="text-sm font-medium truncate leading-none mb-1">{file.name}</p>
                                                <p className="text-[10px] text-muted-foreground font-mono">{(file.size / 1024).toFixed(0)} KB</p>
                                            </div>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-7 w-7 text-muted-foreground hover:text-red-600 -mr-1"
                                                onClick={(e) => { e.stopPropagation(); removeFile(idx); }}
                                            >
                                                <X className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            </ScrollArea>
                        ) : (
                            <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground p-6 text-center opacity-40 select-none">
                                <ImageIcon className="h-12 w-12 mb-3 stroke-1" />
                                <p className="text-sm font-medium">Queue is empty</p>
                                <p className="text-xs">Select files to begin analysis</p>
                            </div>
                        )}
                    </div>

                    <div className="p-4 border-t bg-muted/5 mt-auto">
                        <Button
                            size="lg"
                            className="w-full font-semibold shadow-md"
                            onClick={processBatch}
                            disabled={files.length === 0 || pendingItems.some(b => b.status === 'uploading' || b.status === 'analyzing')}
                        >
                            {pendingItems.some(b => b.status === 'uploading' || b.status === 'analyzing') ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Processing...
                                </>
                            ) : (
                                <>
                                    Analyze {files.length} Document{files.length !== 1 ? 's' : ''}
                                </>
                            )}
                        </Button>
                    </div>
                </Card>
            </div>
            {/* Saved Receipts & Pending Batches Section */}
            <div className="space-y-4">
                <div className="flex items-center gap-3">
                    <FileText className="h-6 w-6 text-primary" />
                    <h2 className="text-2xl font-bold">Saved Receipts</h2>
                </div>

                {
                    loadingReceipts && pendingItems.length === 0 ? (
                        <div className="text-center p-8">
                            <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
                            <p className="text-muted-foreground mt-2">Loading saved receipts...</p>
                        </div>
                    ) : savedReceipts.length === 0 && pendingItems.length === 0 ? (
                        <Card className="bg-muted/10 border-dashed">
                            <CardContent className="py-12 text-center text-muted-foreground">
                                <p>No saved receipts found.</p>
                                <p className="text-sm">Upload documents above to get started.</p>
                            </CardContent>
                        </Card>
                    ) : (
                        <Card className="overflow-hidden">
                            <CardContent className="p-0">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="bg-muted/50">
                                            <TableHead className="w-[120px]">Date</TableHead>
                                            <TableHead className="w-[140px]">Unit ID</TableHead>
                                            <TableHead className="w-[150px]">Bill To</TableHead>
                                            <TableHead>Vendor</TableHead>

                                            <TableHead className="text-right">Total</TableHead>
                                            <TableHead className="w-[120px]"></TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {/* Render Pending Items First */}
                                        {pendingItems.map(item => (
                                            <TableRow key={item.id} className="bg-muted/5 animate-pulse">
                                                <TableCell className="align-top py-4">
                                                    <div className="h-4 w-20 bg-muted/20 rounded"></div>
                                                </TableCell>
                                                <TableCell className="align-top py-4">
                                                    <div className="h-4 w-12 bg-muted/20 rounded"></div>
                                                </TableCell>
                                                <TableCell className="align-top py-4">
                                                    <div className="h-4 w-16 bg-muted/20 rounded"></div>
                                                </TableCell>
                                                <TableCell className="align-top py-4">
                                                    <div className="flex flex-col gap-2">
                                                        <span className="font-semibold text-sm">{item.fileName}</span>
                                                        {item.status === 'error' ? (
                                                            <div className="flex items-center gap-2 text-red-500 text-xs">
                                                                <AlertCircle className="h-3 w-3" />
                                                                <span>{item.error}</span>
                                                            </div>
                                                        ) : (
                                                            <div className="flex items-center gap-2 text-muted-foreground text-xs">
                                                                <Loader2 className="h-3 w-3 animate-spin text-primary" />
                                                                <span>
                                                                    {item.status === 'uploading' ? 'Uploading...' : 'Analyzing (approx. 10s)...'}
                                                                </span>
                                                            </div>
                                                        )}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right align-top py-4">
                                                    <div className="h-4 w-12 bg-muted/20 rounded ml-auto"></div>
                                                </TableCell>
                                                <TableCell className="text-right align-top py-4">
                                                    {item.status === 'error' && (
                                                        <Button variant="ghost" size="sm" onClick={() => dismissError(item.id)} className="h-6 px-2 text-xs border border-red-200 hover:bg-red-50 text-red-600">
                                                            Dismiss
                                                        </Button>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        ))}

                                        {/* Render Real Receipts */}
                                        {savedReceipts.map((receipt) =>
                                            <ReceiptRow
                                                key={receipt.id as any}
                                                receipt={receipt}
                                                availableUnitIds={availableUnitIds}
                                                onUpdateUnitId={(newId) => updateReceiptUnitId(receipt.id as any, newId, receipt.relatedExpenseId)}
                                                onToggleReimbursable={(val) => toggleReimbursable(receipt, val)}
                                                onPreview={() => setPreviewReceipt(receipt)}
                                                onDelete={() => setReceiptToDelete(receipt)}
                                            />
                                        )}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    )
                }
            </div >

            {/* Image Preview Dialog */}
            <Dialog open={!!previewReceipt} onOpenChange={(open) => !open && setPreviewReceipt(null)}>
                <DialogContent className="max-w-4xl h-[90vh] flex flex-col p-0">
                    <DialogHeader className="p-4 border-b">
                        <DialogTitle>Receipt Preview</DialogTitle>
                    </DialogHeader>
                    <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-black/5">
                        {previewReceipt?.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                                src={previewReceipt.imageUrl}
                                alt="Receipt"
                                className="max-w-full max-h-full object-contain rounded-md shadow-sm"
                            />
                        ) : (
                            <div className="text-muted-foreground">No image available</div>
                        )}
                    </div>
                    {previewReceipt?.allImageUrls && previewReceipt.allImageUrls.length > 1 && (
                        <div className="p-4 border-t bg-background overflow-x-auto whitespace-nowrap">
                            <div className="flex gap-2">
                                {previewReceipt.allImageUrls.map((url, idx) => (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                        key={idx}
                                        src={url}
                                        alt={`Page ${idx + 1}`}
                                        className={`h-20 w-auto object-cover rounded border cursor-pointer hover:opacity-80 ${url === previewReceipt.imageUrl ? 'ring-2 ring-primary' : ''}`}
                                        onClick={() => setPreviewReceipt(prev => prev ? ({ ...prev, imageUrl: url }) : null)}
                                    />
                                ))}
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog >

            {/* Delete Confirmation Alert */}
            < AlertDialog open={!!receiptToDelete} onOpenChange={(open) => !open && setReceiptToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will permanently delete this receipt and its associated expense record.
                            {receiptToDelete?.relatedExpenseId && " The linked expense in the Expenses tab will also be removed."}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={confirmDelete} disabled={isDeleting} className="bg-red-600 hover:bg-red-700">
                            {isDeleting ? "Deleting..." : "Delete"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog >
        </div >
    );
}
