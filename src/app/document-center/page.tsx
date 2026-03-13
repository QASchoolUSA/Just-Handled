"use client";

import { useState, useCallback, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
    CloudUpload,
    FileText,
    Loader2,
    CheckCircle2,
    AlertCircle,
    Trash2,
    Eye,
    Upload,
    Image as ImageIcon,
    X,
    ChevronDown
} from 'lucide-react';
import { useFunctions, useFirestore, useStorage, useUser } from '@/firebase';
import { useCompany } from '@/firebase/provider';
import { httpsCallable } from 'firebase/functions';
import {
    collection,
    query,
    where,
    orderBy,
    onSnapshot,
    addDoc,
    serverTimestamp,
    deleteDoc,
    doc,
    updateDoc,
    getDocs,
    limit,
    startAfter // Added for pagination
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
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
import { Checkbox } from "@/components/ui/checkbox";

// --- Interfaces ---

interface ReceiptData {
    receipt_type: string;
    vin?: string | null;
    license_plate?: string | null;
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
    originalFileName?: string;
    storagePath?: string;
}

interface LineItem {
    description: string;
    quantity: string | number;
    unit_price: string | number;
    total: string | number;
}

interface CatScaleData {
    weigh_number: string;
    ticket_number: string;
    truck_number: string;
    trailer_number: string;
    company_name: string;
    steer_axle_weight: string | number;
    drive_axle_weight: string | number;
    trailer_axle_weight: string | number;
    gross_weight: string | number;
    fee: string | number;
}


interface SavedReceipt extends ReceiptData {
    id: string;
    analyzedAt: any;
    status: 'pending' | 'verified' | 'exported';
    userId: string;
}

interface PendingItem {
    id: string;
    fileName: string;
    status: 'uploading' | 'analyzing' | 'complete' | 'error';
    progress?: number;
    error?: string;
    result?: ReceiptData;
}

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/heic', 'application/pdf'];

/** Sanitize a string for use as a single segment in a Firebase Storage path (no slashes, minimal special chars). */
function sanitizeStorageSegment(name: string): string {
    if (!name || typeof name !== 'string') return 'unknown';
    return name
        .trim()
        .replace(/\s+/g, '_')
        .replace(/[/\\[\]*?"]/g, '_')
        .replace(/\s/g, '')
        .slice(0, 64) || 'unknown';
}

/** Build storage path: receipts/{uploaderName}/{YYYY-MM-DD}_{timestamp}_{index}_{filename} */
function getReceiptStoragePath(
    uploaderName: string,
    fileName: string,
    index: number
): string {
    const dateStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const segment = sanitizeStorageSegment(uploaderName);
    const timestamp = Date.now();
    return `receipts/${segment}/${dateStr}_${timestamp}_${index}_${fileName}`;
}

// --- Helper Component for Receipt Row ---
function ReceiptRow({ receipt, availableUnitIds, unitOwners, onUpdateUnitId, onToggleReimbursable, onPreview, onDelete }: {
    receipt: SavedReceipt,
    availableUnitIds: string[],
    unitOwners: Record<string, string>,
    onUpdateUnitId: (id: string) => void,
    onToggleReimbursable: (val: boolean) => void,
    onPreview: () => void,
    onDelete: () => void
}) {
    const formattedDate = receipt.transaction_date ? new Date(receipt.transaction_date).toLocaleDateString() : 'N/A';
    const amount = typeof receipt.total_amount === 'number' ? receipt.total_amount : parseFloat(String(receipt.total_amount).replace(/[^0-9.]/g, '') || '0');
    const billTo = receipt.unit_id ? (unitOwners[receipt.unit_id] || '-') : '-';
    const vin = (receipt.vin || '').trim() || '-';
    const plate = (receipt.license_plate || '').trim() || '-';

    return (
        <TableRow>
            <TableCell>{formattedDate}</TableCell>
            <TableCell>
                <Select
                    value={receipt.unit_id || "unassigned"}
                    onValueChange={(val) => onUpdateUnitId(val === "unassigned" ? "" : val)}
                >
                    <SelectTrigger className="h-8 w-[140px]">
                        <SelectValue placeholder="Unit ID" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="unassigned">Unassigned</SelectItem>
                        {availableUnitIds.map(id => (
                            <SelectItem key={id} value={id}>{id}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </TableCell>
            <TableCell>{billTo}</TableCell>
            <TableCell className="font-medium">{receipt.vendor_name || 'Unknown Vendor'}</TableCell>
            <TableCell className="font-mono text-xs">{vin}</TableCell>
            <TableCell className="font-mono text-xs">{plate}</TableCell>
            <TableCell>
                <div className="flex items-center justify-center">
                    <Switch
                        id={`reimbursable-${receipt.id}`}
                        checked={receipt.reimbursable || false}
                        onCheckedChange={(checked) => onToggleReimbursable(checked)}
                    />
                </div>
            </TableCell>

            <TableCell className="text-right">${amount.toFixed(2)}</TableCell>
            <TableCell className="text-right">
                <div className="flex items-center justify-end gap-2">
                    <Button variant="ghost" size="icon" onClick={onPreview}>
                        <Eye className="h-4 w-4 text-muted-foreground" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={onDelete} className="text-red-500 hover:text-red-600">
                        <Trash2 className="h-4 w-4" />
                    </Button>
                </div>
            </TableCell>
        </TableRow>
    );
}


export default function AnalyzeDocsPage() {
    const { toast } = useToast();
    const functions = useFunctions();
    const firestore = useFirestore();
    const storage = useStorage();
    const { user } = useUser();
    const { companyId } = useCompany();

    // -- State --
    const [files, setFiles] = useState<File[]>([]);
    const [isDragging, setIsDragging] = useState(false);
    const [pendingItems, setPendingItems] = useState<PendingItem[]>([]);
    const [savedReceipts, setSavedReceipts] = useState<SavedReceipt[]>([]);
    const [availableUnitIds, setAvailableUnitIds] = useState<string[]>([]);
    const [unitOwners, setUnitOwners] = useState<Record<string, string>>({});
    const [previewReceipt, setPreviewReceipt] = useState<SavedReceipt | null>(null);
    const [receiptToDelete, setReceiptToDelete] = useState<SavedReceipt | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Pagination State
    const [receiptLimit, setReceiptLimit] = useState(15);
    const [loadingReceipts, setLoadingReceipts] = useState(true);

    // Queue Pagination State
    const [queuePage, setQueuePage] = useState(1);
    const ITEMS_PER_QUEUE_PAGE = 5;

    // Derived queue data needed for rendering
    const validFiles = files || [];
    const validPending = pendingItems || [];
    // If pending items exist, show them (paginated), else show ready files (paginated)
    const showingPending = validPending.length > 0;
    const totalQueueItems = showingPending ? validPending.length : validFiles.length;
    const totalQueuePages = Math.ceil(totalQueueItems / ITEMS_PER_QUEUE_PAGE);

    // Get current page slice
    const paginatedQueue = showingPending
        ? validPending.slice((queuePage - 1) * ITEMS_PER_QUEUE_PAGE, queuePage * ITEMS_PER_QUEUE_PAGE)
        : []; // For files, we slice inline in the render to access the original index easily if needed, or mapped cleanly

    // -- Effects --

    // 1. Fetch Saved Receipts (Real-time) with Pagination
    useEffect(() => {
        if (!user || !firestore || !companyId) return;
        setLoadingReceipts(true);

        const q = query(
            collection(firestore, `companies/${companyId}/receipts`),
            orderBy('createdAt', 'desc'),
            limit(receiptLimit)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const receipts = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as SavedReceipt[];
            setSavedReceipts(receipts);
            setLoadingReceipts(false);
        }, (err) => {
            console.error("Error fetching receipts:", err);
            setLoadingReceipts(false);
        });

        return () => unsubscribe();
    }, [user, firestore, receiptLimit]);

    // 2. Fetch Unit IDs & Owners (for dropdown & bill to)
    useEffect(() => {
        if (!user || !firestore || !companyId) return;

        const fetchData = async () => {
            try {
                // Fetch Drivers for Unit IDs
                const driversSnap = await getDocs(collection(firestore, `companies/${companyId}/drivers`));
                const driverUnitIds = driversSnap.docs
                    .map(d => d.data().unitId)
                    .filter(Boolean);

                // Fetch Owners for "Bill To" mapping and Unit IDs
                const ownersSnap = await getDocs(collection(firestore, `companies/${companyId}/owners`));
                const ownerMap: Record<string, string> = {};
                const ownerUnitIds: string[] = [];

                ownersSnap.docs.forEach(doc => {
                    const data = doc.data();
                    if (data.unitId) {
                        ownerUnitIds.push(data.unitId);
                        if (data.name) {
                            ownerMap[data.unitId] = data.name;
                        }
                    }
                });

                setUnitOwners(ownerMap);

                // Combine unique Unit IDs
                const allUnitIds = Array.from(new Set([...driverUnitIds, ...ownerUnitIds])).sort();

                if (allUnitIds.length > 0) {
                    setAvailableUnitIds(allUnitIds);
                } else {
                    setAvailableUnitIds(['101', '102', '103']); // Fallback
                }

            } catch (e) {
                console.error("Error fetching units/owners:", e);
                // Fallback or empty
                if (availableUnitIds.length === 0) setAvailableUnitIds(['101', '102', '103']);
            }
        };
        fetchData();
    }, [user, firestore]);


    // -- Handlers --

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            setFiles(prev => [...prev, ...Array.from(e.target.files!)]);
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
            const newFiles = Array.from(e.dataTransfer.files).filter(file =>
                ALLOWED_TYPES.includes(file.type)
            );
            if (newFiles.length !== e.dataTransfer.files.length) {
                toast({
                    title: "Invalid File Type",
                    description: "Some files were skipped. Only Images and PDFs are allowed.",
                    variant: "destructive",
                });
            }
            setFiles(prev => [...prev, ...newFiles]);
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

        // Process files sequentially to avoid timeouts
        for (let i = 0; i < currentFiles.length; i++) {
            const file = currentFiles[i];
            const itemId = newItems[i].id;

            try {
                // 1. Upload & Read
                // Update status to uploading
                setPendingItems(prev => prev.map(item =>
                    item.id === itemId ? { ...item, status: 'uploading' } : item
                ));

                const arrayBuffer = await file.arrayBuffer();
                const base64String = Buffer.from(arrayBuffer).toString('base64');
                const filePayload = { data: base64String, mimeType: file.type };

                let fileDetails = null;

                if (user && storage) {
                    const uploaderName = user.displayName || user.email?.split('@')[0] || user.uid;
                    const storagePath = getReceiptStoragePath(uploaderName, file.name, i);
                    const storageRef = ref(storage, storagePath);
                    await uploadBytes(storageRef, file);
                    const downloadURL = await getDownloadURL(storageRef);
                    fileDetails = { url: downloadURL, path: storagePath, name: file.name, mimeType: file.type };
                }

                // 2. Analyze
                // Update status to analyzing
                setPendingItems(prev => prev.map(item =>
                    item.id === itemId ? { ...item, status: 'analyzing' } : item
                ));

                // Send SINGLE file payload
                const result = await analyzeDocs({ files: [filePayload] });
                const data = result.data as any;
                const extractedReceipts: ReceiptData[] = data.receipts || [];

                // 3. Save
                if (user && firestore && extractedReceipts.length > 0) {
                    // Start batch for atomic writes (optional per receipt, but here acts per file)
                    for (const receipt of extractedReceipts) {

                        // 0. Override Unit ID from Filename if present (per user request)
                        // Look for exactly 4 digits surrounding by non-digits
                        const filenameMatch = file.name.match(/(?:^|\D)(\d{4})(?:\D|$)/);
                        if (filenameMatch) {
                            receipt.unit_id = filenameMatch[1];
                        }

                        // Lookup Owner/Driver if Unit ID exists
                        let expenseOwner = null;
                        let expenseType: 'company' | 'driver' | 'owner' = 'company';
                        let matchedDriverId = null;
                        let matchedOwnerId = null;

                        if (receipt.unit_id) {
                            const cleanUnitId = receipt.unit_id.trim();

                            // 1. Check Owners
                            const qOwner = query(
                                collection(firestore, `companies/${companyId}/owners`),
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
                                collection(firestore, `companies/${companyId}/drivers`),
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
                            const expenseDoc = await addDoc(collection(firestore, `companies/${companyId}/expenses`), {
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

                        await addDoc(collection(firestore, `companies/${companyId}/receipts`), {
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
                setPendingItems(prev => prev.filter(item => item.id !== itemId));

            } catch (err: any) {
                console.error(`Error processing file ${file.name}:`, err);
                // Update status to error for THIS item only
                setPendingItems(prev => prev.map(item =>
                    item.id === itemId
                        ? { ...item, status: 'error', error: err.message || "Unknown error" }
                        : item
                ));
            }
        }
    };

    const dismissError = (itemId: string) => {
        setPendingItems(prev => prev.filter(item => item.id !== itemId));
    };

    const updateReceiptUnitId = async (receiptId: string, newUnitId: string, relatedExpenseId?: string) => {
        if (!firestore || !companyId) return;

        try {
            // 1. Update Receipt
            await updateDoc(doc(firestore, `companies/${companyId}/receipts`, receiptId), {
                unit_id: newUnitId
            });

            // 2. Logic to update Expense Owner if Unit ID changes (Simplified)
            // In a real app, you'd re-run the driver/owner lookup here to keep them in sync.
            // For now, we update the expense unitId at least.
            if (relatedExpenseId) {
                await updateDoc(doc(firestore, `companies/${companyId}/expenses`, relatedExpenseId), {
                    unitId: newUnitId
                });
            }

            toast({ title: "Unit ID Updated", description: `Assigned to Unit ${newUnitId}` });

        } catch (e) {
            toast({ title: "Update Failed", description: "Could not update unit ID.", variant: "destructive" });
        }
    };

    const toggleReimbursable = async (receipt: SavedReceipt, val: boolean) => {
        if (!firestore || !companyId) return;
        try {
            await updateDoc(doc(firestore, `companies/${companyId}/receipts`, receipt.id), {
                reimbursable: val
            });
        } catch (e) {
            toast({ title: "Update Failed", variant: "destructive" });
        }
    }


    const confirmDelete = async () => {
        if (!receiptToDelete || !firestore || !companyId) return;
        setIsDeleting(true);
        try {
            // 1. Delete Firestore Receipt
            await deleteDoc(doc(firestore, `companies/${companyId}/receipts`, receiptToDelete.id));

            // 2. Delete Related Expense
            if (receiptToDelete.relatedExpenseId) {
                await deleteDoc(doc(firestore, `companies/${companyId}/expenses`, receiptToDelete.relatedExpenseId));
            }

            // 3. Delete from Storage (Optional - cleanup)
            // if (receiptToDelete.storagePath && storage) {
            //      const imgRef = ref(storage, receiptToDelete.storagePath);
            //      await deleteObject(imgRef).catch(e => console.warn("Storage delete failed", e));
            // }

            setReceiptToDelete(null);
            toast({ title: "Receipt Deleted", description: "Expense record also removed." });
        } catch (e) {
            console.error("Delete error:", e);
            toast({ title: "Delete Failed", variant: "destructive" });
        } finally {
            setIsDeleting(false);
        }
    };


    return (
        <div className="container mx-auto p-6 max-w-7xl space-y-8">
            <div className="space-y-2">
                <h1 className="text-3xl font-bold tracking-tight">Document Center</h1>
                <p className="text-muted-foreground">
                    Upload receipts and documents for AI analysis.
                </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left Column: Upload & Saved Receipts */}
                <div className="lg:col-span-1 flex flex-col">
                    {/* 1. Upload Area */}
                    <Card className={`h-full flex flex-col border-2 border-dashed shadow-sm transition-colors ${isDragging ? 'border-primary bg-primary/5' : 'border-border bg-card'
                        }`}>
                        <CardContent
                            className="flex-1 p-6 flex flex-col items-center justify-center min-h-[300px] text-center space-y-4 cursor-pointer"
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onDrop={handleDrop}
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mb-2">
                                <CloudUpload className="h-8 w-8 text-primary" />
                            </div>
                            <div>
                                <h3 className="text-lg font-semibold">Upload Documents</h3>
                                <p className="text-sm text-muted-foreground">
                                    Drag & drop or click to browse
                                </p>
                            </div>

                            <div className="w-full flex items-center gap-2 text-xs text-muted-foreground">
                                <div className="h-px bg-border flex-1" />
                                <span>OR</span>
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

                            {files.length > 0 && (
                                <div className="mt-4 flex items-center justify-between text-sm bg-muted/50 p-2 rounded w-full max-w-xs transition-in fade-in slide-in-from-bottom-2">
                                    <span className="font-medium truncate max-w-[150px]">{files.length} file{files.length !== 1 ? 's' : ''} selected</span>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setFiles([]);
                                            if (fileInputRef.current) fileInputRef.current.value = "";
                                        }}
                                        className="h-6 px-2 text-muted-foreground hover:text-foreground hover:bg-muted"
                                    >
                                        Clear
                                    </Button>
                                </div>
                            )}


                        </CardContent>
                    </Card>


                </div>



                {/* Right Column: Analysis Queue */}
                <div className="lg:col-span-2">
                    <Card className="flex flex-col h-full min-h-[600px] border shadow-sm">
                        <CardHeader className="pb-3 border-b bg-muted/5">
                            <CardTitle className="text-base font-medium flex justify-between items-center">
                                <span>Analysis Queue</span>
                                <Badge variant={pendingItems.length > 0 ? "default" : "secondary"} className="transition-all">
                                    {pendingItems.length > 0 ? `${pendingItems.length} Pending` : `${files.length} Ready`}
                                </Badge>
                            </CardTitle>
                        </CardHeader>

                        <div className="flex-1 relative bg-background flex flex-col">
                            {pendingItems.length > 0 ? (
                                <>
                                    <ScrollArea className="flex-1">
                                        <div className="p-4 space-y-3">
                                            {paginatedQueue.map((item) => (
                                                <div key={item.id} className="flex gap-3 items-start p-3 rounded-lg border bg-card shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-300">
                                                    <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0 border mt-0.5">
                                                        {item.status === 'uploading' && <CloudUpload className="h-4 w-4 text-primary animate-bounce" />}
                                                        {item.status === 'analyzing' && <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />}
                                                        {item.status === 'error' && <AlertCircle className="h-4 w-4 text-red-500" />}
                                                    </div>
                                                    <div className="flex-1 min-w-0 space-y-1">
                                                        <p className="text-sm font-medium leading-none truncate" title={item.fileName}>
                                                            {item.fileName}
                                                        </p>
                                                        <div className="flex items-center justify-between">
                                                            <span className={`text-xs font-medium ${item.status === 'error' ? 'text-red-500' :
                                                                item.status === 'analyzing' ? 'text-blue-500' :
                                                                    'text-muted-foreground'
                                                                }`}>
                                                                {item.status === 'uploading' && 'Uploading...'}
                                                                {item.status === 'analyzing' && 'Analyzing...'}
                                                                {item.status === 'error' && (item.error || 'Failed')}
                                                            </span>
                                                            {item.status === 'error' && (
                                                                <button
                                                                    onClick={() => dismissError(item.id)}
                                                                    className="text-[10px] text-muted-foreground hover:text-foreground underline"
                                                                >
                                                                    Dismiss
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </ScrollArea>
                                    {/* Queue Pagination */}
                                    {totalQueuePages > 1 && (
                                        <div className="p-2 border-t flex items-center justify-between text-xs bg-muted/5">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => setQueuePage(p => Math.max(1, p - 1))}
                                                disabled={queuePage === 1}
                                                className="h-7 px-2"
                                            >
                                                <ChevronDown className="h-3 w-3 rotate-90 mr-1" /> Prev
                                            </Button>
                                            <span className="text-muted-foreground">
                                                Page {queuePage} of {totalQueuePages}
                                            </span>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => setQueuePage(p => Math.min(totalQueuePages, p + 1))}
                                                disabled={queuePage === totalQueuePages}
                                                className="h-7 px-2"
                                            >
                                                Next <ChevronDown className="h-3 w-3 -rotate-90 ml-1" />
                                            </Button>
                                        </div>
                                    )}
                                </>
                            ) : files.length > 0 ? (
                                <>
                                    <ScrollArea className="flex-1">
                                        <div className="p-4 space-y-3">
                                            {/* Show paginated files (Ready state) using queuePage */}
                                            {files.slice((queuePage - 1) * ITEMS_PER_QUEUE_PAGE, queuePage * ITEMS_PER_QUEUE_PAGE).map((file, idx) => {
                                                // Calculate actual index in the full array for removal
                                                const actualIdx = (queuePage - 1) * ITEMS_PER_QUEUE_PAGE + idx;
                                                return (
                                                    <div key={actualIdx} className="flex gap-3 items-start p-3 rounded-lg border bg-card shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-300">
                                                        <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0 border mt-0.5">
                                                            <FileText className="h-4 w-4 text-muted-foreground" />
                                                        </div>
                                                        <div className="flex-1 min-w-0 space-y-1">
                                                            <p className="text-sm font-medium leading-none truncate">{file.name}</p>
                                                            <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(0)} KB</p>
                                                        </div>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-6 w-6 text-muted-foreground hover:text-red-600"
                                                            onClick={() => removeFile(actualIdx)}
                                                        >
                                                            <X className="h-3 w-3" />
                                                        </Button>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </ScrollArea>
                                    {/* File Queue Pagination */}
                                    {Math.ceil(files.length / ITEMS_PER_QUEUE_PAGE) > 1 && (
                                        <div className="p-2 border-t flex items-center justify-between text-xs bg-muted/5 mt-auto">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => setQueuePage(p => Math.max(1, p - 1))}
                                                disabled={queuePage === 1}
                                                className="h-7 px-2"
                                            >
                                                <ChevronDown className="h-3 w-3 rotate-90 mr-1" /> Prev
                                            </Button>
                                            <span className="text-muted-foreground">
                                                Page {queuePage} of {Math.ceil(files.length / ITEMS_PER_QUEUE_PAGE)}
                                            </span>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => setQueuePage(p => Math.min(Math.ceil(files.length / ITEMS_PER_QUEUE_PAGE), p + 1))}
                                                disabled={queuePage === Math.ceil(files.length / ITEMS_PER_QUEUE_PAGE)}
                                                className="h-7 px-2"
                                            >
                                                Next <ChevronDown className="h-3 w-3 -rotate-90 ml-1" />
                                            </Button>
                                        </div>
                                    )}
                                </>
                            ) : (
                                <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-6 text-center opacity-40 select-none">
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
            </div>


            {/* Saved Receipts & Pending Batches Section */}
            <div className="space-y-4">
                <div className="flex items-center gap-3">
                    <FileText className="h-6 w-6 text-primary" />
                    <h2 className="text-2xl font-bold">Saved Receipts</h2>
                </div>

                {loadingReceipts && savedReceipts.length === 0 && pendingItems.length === 0 ? (
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
                                        <TableHead className="w-[190px]">VIN</TableHead>
                                        <TableHead className="w-[140px]">Plate</TableHead>
                                        <TableHead className="w-[150px]">Reimbursable</TableHead>
                                        <TableHead className="text-right">Total</TableHead>
                                        <TableHead className="w-[120px]"></TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {savedReceipts.map((receipt) => (
                                        <ReceiptRow
                                            key={receipt.id}
                                            receipt={receipt}
                                            availableUnitIds={availableUnitIds}
                                            unitOwners={unitOwners}
                                            onUpdateUnitId={(newId) => updateReceiptUnitId(receipt.id, newId, receipt.relatedExpenseId)}
                                            onToggleReimbursable={(val) => toggleReimbursable(receipt, val)}
                                            onPreview={() => setPreviewReceipt(receipt)}
                                            onDelete={() => setReceiptToDelete(receipt)}
                                        />
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                        {savedReceipts.length >= 15 && (
                            <div className="bg-muted/5 border-t p-2 text-center">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setReceiptLimit(prev => prev + 20)}
                                    className="w-full text-muted-foreground hover:text-primary transition-colors h-8"
                                    disabled={loadingReceipts}
                                >
                                    {loadingReceipts ? (
                                        <>
                                            <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                                            Loading more...
                                        </>
                                    ) : (
                                        <>
                                            Load More Receipts
                                            <ChevronDown className="ml-2 h-3 w-3" />
                                        </>
                                    )}
                                </Button>
                            </div>
                        )}
                    </Card>
                )}
            </div>



            {/* Image Preview Dialog */}
            <Dialog open={!!previewReceipt} onOpenChange={(open) => !open && setPreviewReceipt(null)}>
                <DialogContent className="max-w-4xl h-[90vh] flex flex-col p-0">
                    <DialogHeader className="p-4 border-b">
                        <DialogTitle>Receipt Preview</DialogTitle>
                    </DialogHeader>
                    <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-black/5">
                        {previewReceipt?.imageUrl ? (
                            previewReceipt.imageUrl.toLowerCase().includes('.pdf') || (previewReceipt.originalFileName?.toLowerCase().endsWith('.pdf')) ? (
                                <iframe
                                    src={previewReceipt.imageUrl}
                                    className="w-full h-full rounded-md shadow-sm border-none"
                                    title="PDF Preview"
                                />
                            ) : (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                    src={previewReceipt.imageUrl}
                                    alt="Receipt"
                                    className="max-w-full max-h-full object-contain rounded-md shadow-sm"
                                />
                            )
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
            </Dialog>

            {/* Delete Confirmation Alert */}
            <AlertDialog open={!!receiptToDelete} onOpenChange={(open) => !open && setReceiptToDelete(null)}>
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
            </AlertDialog>
        </div >
    );
}
