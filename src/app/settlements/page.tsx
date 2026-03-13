'use client';

import React, { useState, useMemo } from 'react';
import useLocalStorage from '@/hooks/use-local-storage';
import { PlusCircle, MoreHorizontal, FileDown, Paperclip, Download, Upload, Columns, Search, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Calendar, GripVertical, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSettlementCalculations } from '@/hooks/use-settlement-calculations';
import { SettlementCard } from '@/components/settlement-card';
import { startOfWeek, endOfWeek, addWeeks, subWeeks, format, parseISO, parse, isWithinInterval } from 'date-fns';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { LoadForm } from '@/components/load-form';
import { ExpenseForm } from '@/components/expense-form';
import type { Load, Driver, Expense, AccountSettings, Owner, SettlementSummary, OwnerSettlementSummary } from '@/lib/types';
// import { generateSettlementPDF } from '@/lib/exports/pdf-exports'; // Dynamic import used instead
import { LS_KEYS, DEFAULT_ACCOUNTS } from '@/lib/constants';
import { formatCurrency, downloadCsv, parseNumber, normalizeDateFormat, toTitleCase, calculateDriverPay } from '@/lib/utils';
import { exportInvoicesAsCsv, exportJournalAsCsv } from '@/lib/exports/csv-exports';
import Papa from 'papaparse';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { useCompany } from '@/firebase/provider';
import { collection, doc, query, where, getDocs, limit, writeBatch } from 'firebase/firestore';
import { addDocumentNonBlocking, deleteDocumentNonBlocking, setDocumentNonBlocking } from '@/firebase/non-blocking-updates';

import { GroupedOwnerSettlement } from '@/components/grouped-owner-settlement';
import type { ImportError, ImportResult } from '@/lib/types';

// --- Helper Functions ---




// Start Date Helper
const parseDateHelper = (dateStr: string) => {
  if (!dateStr) return new Date();

  // Try ISO first (YYYY-MM-DD)
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return parseISO(dateStr);
  }

  // Try Legacy (dd-MMM-yy)
  const parsed = parse(dateStr, 'dd-MMM-yy', new Date());
  if (!isNaN(parsed.getTime())) {
    return parsed;
  }

  // Try native date parsing (covers MM/DD/YY, etc.)
  const native = new Date(dateStr);
  if (!isNaN(native.getTime())) {
    return native;
  }

  // Fallback
  return new Date();
};
// End Date Helper

const formatLocationShort = (loc: string) => {
  if (!loc) return '-';
  const match = loc.match(/([a-zA-Z]{2})\s*(\d{5}(?:[- ]\d{4})?)?\s*$/);
  if (match) {
    return `${match[1].toUpperCase()} ${match[2] || ''}`.trim();
  }
  // Fallback
  const parts = loc.split(',');
  return parts.length > 1 ? parts[parts.length - 1].trim() : loc;
};

const TABLE_COLUMNS = [
  { id: 'loadNumber', label: 'Load #' },
  { id: 'driver', label: 'Driver' },
  { id: 'pickupDate', label: 'Pickup Date' },
  { id: 'deliveryDate', label: 'Delivery Date' },
  { id: 'pickupLocation', label: 'Pick Up Location' },
  { id: 'deliveryLocation', label: 'Delivery Location' },
  { id: 'extraStops', label: 'Extra Stops' },
  { id: 'extraStopsPay', label: 'Extra Stops Pay' },
  { id: 'invoiceAmount', label: 'Invoice Amt' },
  { id: 'totalPay', label: 'Total Pay' },
  { id: 'advance', label: 'Advance' },
];

export default function SettlementsPage() {
  const firestore = useFirestore();
  const { companyId } = useCompany();

  // Format dates for Firestore query (YYYY-MM-DD)
  // We use state for selectedWeek, so these need to be derived from that
  const [selectedWeek, setSelectedWeek] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));

  const weekStartStr = format(startOfWeek(selectedWeek, { weekStartsOn: 1 }), 'yyyy-MM-dd');
  const weekEndStr = format(endOfWeek(selectedWeek, { weekStartsOn: 1 }), 'yyyy-MM-dd');

  // --- Firestore Queries with Date Filtering ---
  // --- Firestore References (For Writes) ---
  const loadsCollectionRef = useMemoFirebase(() => firestore && companyId ? collection(firestore, `companies/${companyId}/loads`) : null, [firestore, companyId]);
  const expensesCollectionRef = useMemoFirebase(() => firestore && companyId ? collection(firestore, `companies/${companyId}/expenses`) : null, [firestore, companyId]);
  const driversCollection = useMemoFirebase(() => firestore && companyId ? collection(firestore, `companies/${companyId}/drivers`) : null, [firestore, companyId]);
  const ownersCollection = useMemoFirebase(() => firestore && companyId ? collection(firestore, `companies/${companyId}/owners`) : null, [firestore, companyId]);

  // --- Firestore Queries (For Reads with Date Filtering) ---

  // --- Firestore Queries (Server-Side Filtering) ---
  const loadsQuery = useMemoFirebase(() => {
    if (!loadsCollectionRef) return null;
    return query(
      loadsCollectionRef,
      where('pickupDate', '>=', weekStartStr),
      where('pickupDate', '<=', weekEndStr)
    );
  }, [loadsCollectionRef, weekStartStr, weekEndStr]);

  const expensesQuery = useMemoFirebase(() => {
    if (!expensesCollectionRef) return null;
    return query(
      expensesCollectionRef,
      where('date', '>=', weekStartStr),
      where('date', '<=', weekEndStr + 'T23:59:59.999Z')
    );
  }, [expensesCollectionRef, weekStartStr, weekEndStr]);

  const { data: loads, loading: loadsLoading } = useCollection<Load>(loadsQuery);
  const { data: expenses, loading: expensesLoading } = useCollection<Expense>(expensesQuery);
  // Optional: driver and owner collections are still fetched in full for mapping and forms, which is fine since they are small.
  const { data: drivers, loading: driversLoading } = useCollection<Driver>(driversCollection);
  const { data: owners, loading: ownersLoading } = useCollection<Owner>(ownersCollection);




  const [accounts] = useLocalStorage<AccountSettings>(LS_KEYS.ACCOUNTS, DEFAULT_ACCOUNTS);

  const [isLoadFormOpen, setIsLoadFormOpen] = useState(false);
  const [editingLoad, setEditingLoad] = useState<Load | undefined>(undefined);
  const [isExpenseFormOpen, setIsExpenseFormOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | undefined>(undefined);
  const [activeTab, setActiveTab] = useState('loads');
  const [expenseFilter, setExpenseFilter] = useState<'all' | 'driver' | 'owner' | 'company'>('all');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(new Set(TABLE_COLUMNS.map(c => c.id)));
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchingGlobal, setIsSearchingGlobal] = useState(false);
  const [sortColumn, setSortColumn] = useState<'pickupDate' | 'deliveryDate' | 'driverName' | null>('pickupDate');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const handleGlobalSearch = async () => {
    if (!searchQuery.trim() || !firestore || !companyId) return;
    setIsSearchingGlobal(true);
    try {
      const q = query(
        collection(firestore, `companies/${companyId}/loads`),
        where('loadNumber', '==', searchQuery.trim()),
        limit(1)
      );
      const snapshot = await getDocs(q);

      if (!snapshot.empty) {
        const load = snapshot.docs[0].data() as Load;
        const pickupDate = parseDateHelper(load.pickupDate);
        setSelectedWeek(startOfWeek(pickupDate, { weekStartsOn: 1 }));
        setActiveTab('loads');
      } else {
        alert(`Load #${searchQuery.trim()} not found in any period.`);
      }
    } catch (e: any) {
      console.error('Global search error:', e);
      alert('Error searching for load: ' + (e.message || String(e)));
    } finally {
      setIsSearchingGlobal(false);
    }
  };

  const handleSortColumn = (column: 'pickupDate' | 'deliveryDate' | 'driverName') => {
    if (sortColumn === column) {
      // Toggle direction if same column
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      // New column, default to ascending
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  // const [selectedWeek, setSelectedWeek] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 })); // Moved up
  // const weekStart = useMemo(() => selectedWeek, [selectedWeek]);
  // const weekEnd = useMemo(() => endOfWeek(selectedWeek, { weekStartsOn: 1 }), [selectedWeek]);

  const weekStart = startOfWeek(selectedWeek, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(selectedWeek, { weekStartsOn: 1 });

  const handlePrevWeek = () => setSelectedWeek(prev => subWeeks(prev, 1));
  const handleNextWeek = () => setSelectedWeek(prev => addWeeks(prev, 1));
  const handleDateSelect = (date: Date | undefined) => {
    if (date) {
      setSelectedWeek(startOfWeek(date, { weekStartsOn: 1 }));
    }
  };

  // --- Column Resizing Removed ---

  const driverMap = useMemo(() => new Map(drivers?.map((d) => [d.id, d])), [drivers]);

  // Filter loads based on search query and selected week
  const filteredLoads = useMemo<Load[]>(() => {
    if (!loads) return [];

    const weekInterval = { start: weekStart, end: weekEnd };

    return loads
      .filter(load => {
        // Date Filter: pickupDate must be within selected week
        const loadDate = parseDateHelper(load.pickupDate);
        if (!isWithinInterval(loadDate, weekInterval)) return false;

        // Search Query Filter
        if (!searchQuery.trim()) return true;

        const query = searchQuery.toLowerCase();
        const driver = driverMap.get(load.driverId);
        const driverName = driver ? `${driver.firstName} ${driver.lastName}`.toLowerCase() : '';

        return (
          load.loadNumber.toLowerCase().includes(query) ||
          driverName.includes(query) ||
          load.pickupLocation.toLowerCase().includes(query) ||
          load.deliveryLocation.toLowerCase().includes(query)
        );
      })
      .sort((a, b) => {
        if (!sortColumn) return 0;

        if (sortColumn === 'driverName') {
          // Sort by driver name alphabetically
          const driverA = driverMap.get(a.driverId);
          const driverB = driverMap.get(b.driverId);
          const nameA = driverA ? `${driverA.firstName} ${driverA.lastName}`.toLowerCase() : '';
          const nameB = driverB ? `${driverB.firstName} ${driverB.lastName}`.toLowerCase() : '';

          const comparison = nameA.localeCompare(nameB);
          return sortDirection === 'asc' ? comparison : -comparison;
        } else {
          // Sort by date (pickupDate or deliveryDate)
          const dateA = parseDateHelper(sortColumn === 'pickupDate' ? a.pickupDate : a.deliveryDate);
          const dateB = parseDateHelper(sortColumn === 'pickupDate' ? b.pickupDate : b.deliveryDate);

          const diff = dateA.getTime() - dateB.getTime();
          return sortDirection === 'asc' ? diff : -diff;
        }
      });
  }, [loads, searchQuery, driverMap, weekStart, weekEnd, sortColumn, sortDirection]);

  const filteredExpenses = useMemo<Expense[]>(() => {
    if (!expenses) return [];

    const weekInterval = { start: weekStart, end: weekEnd };

    return expenses.filter(expense => {
      // Date Filter
      const expenseDate = new Date(expense.date + 'T00:00:00');
      if (!isWithinInterval(expenseDate, weekInterval)) return false;

      // Type Filter
      if (expenseFilter !== 'all') {
        if (expense.type !== expenseFilter) return false;
      }

      return true;
    });
  }, [expenses, weekStart, weekEnd, expenseFilter]);

  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [isImportResultOpen, setIsImportResultOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);





  // --- Data Migration (Robust) ---


  const handleAnalyzeData = async () => {
    if (!firestore || !loadsCollectionRef) return;
    try {
      const snapshot = await getDocs(loadsCollectionRef);
      const total = snapshot.size;
      let isoCount = 0;
      let legacyCount = 0;
      let unknownCount = 0;
      const samples: string[] = [];  // Collecting RAW samples of non-migrated data

      let minDate = '';
      let maxDate = '';

      snapshot.forEach(doc => {
        const data = doc.data();
        const date = data.pickupDate;
        if (!date) return;

        if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
          isoCount++;
          if (!minDate || date < minDate) minDate = date;
          if (!maxDate || date > maxDate) maxDate = date;
        } else if (/\d{1,2}-[a-zA-Z]{3}-\d{2}/.test(date)) {
          legacyCount++;
        } else {
          unknownCount++;
          if (samples.length < 5) samples.push(`${String(date)}`);
        }
      });

      const filterMsg = `
        Current View: ${weekStartStr} to ${weekEndStr}
        
        Database Status:
        - Total Records: ${total}
        - Migrated (ISO): ${isoCount} 
          -> Range: ${minDate || 'N/A'} to ${maxDate || 'N/A'}
        - Legacy (Need Migration): ${legacyCount}
        - Unknown: ${unknownCount}
        - RAW SAMPLES: ${samples.join(', ')}
        
        ADVICE:
        - If 'RAW SAMPLES' are visible, click Migrate.
        - If 'Updated 0 loads' after migrating, the format is tricky.
        `;

      alert(filterMsg);
    } catch (e) {
      alert('Analysis failed: ' + e);
    }
  };


  // --- Load Management ---
  const handleAddLoad = () => {
    setEditingLoad(undefined);
    setIsLoadFormOpen(true);
  };
  const handleEditLoad = (load: Load) => {
    setEditingLoad(load);
    setIsLoadFormOpen(true);
  };
  const handleDeleteLoad = async (loadId: string) => {
    if (firestore && companyId && confirm('Are you sure you want to delete this load?')) {
      deleteDocumentNonBlocking(doc(firestore, `companies/${companyId}/loads`, loadId));
    }
  };
  const handleSaveLoad = async (loadData: Omit<Load, 'id'>) => {
    // This is a temporary setup. File upload logic will replace this.
    // Ensure undefined values are converted to null for Firestore
    const dataToSave = {
      ...loadData,
      proofOfDeliveryUrl: loadData.proofOfDeliveryUrl || null,
      rateConfirmationUrl: loadData.rateConfirmationUrl || null,
      brokerId: loadData.brokerId || null,
      truckId: loadData.truckId || null,
      trailerNumber: loadData.trailerNumber || null,
      emptyMiles: loadData.emptyMiles || 0,
      primeRateSurcharge: loadData.primeRateSurcharge || 0,
      transactionFee: loadData.transactionFee || 0,
      extraStops: loadData.extraStops ?? 0,
      extraStopsPay: loadData.extraStopsPay ?? 0,
    };

    if (firestore && loadsCollectionRef && companyId) {
      if (editingLoad) {
        const loadDoc = doc(firestore, `companies/${companyId}/loads`, editingLoad.id);
        setDocumentNonBlocking(loadDoc, dataToSave, { merge: true });
      } else {
        if (!loadsCollectionRef) return;
        addDocumentNonBlocking(loadsCollectionRef, dataToSave);
      }
    }
    setIsLoadFormOpen(false);
  };


  const handleAddExpense = () => {
    setEditingExpense(undefined);
    setIsExpenseFormOpen(true);
  };
  const handleEditExpense = (expense: Expense) => {
    setEditingExpense(expense);
    setIsExpenseFormOpen(true);
  };
  const handleDeleteExpense = async (expenseId: string) => {
    if (firestore && companyId && confirm('Are you sure you want to delete this expense?')) {
      deleteDocumentNonBlocking(doc(firestore, `companies/${companyId}/expenses`, expenseId));
    }
  };
  const handleSaveExpense = async (expenseData: Omit<Expense, 'id'>) => {
    if (!firestore || !expensesCollectionRef || !companyId) return;
    if (editingExpense) {
      setDocumentNonBlocking(doc(firestore, `companies/${companyId}/expenses`, editingExpense.id), expenseData, { merge: true });
    } else {
      if (!expensesCollectionRef) return;
      addDocumentNonBlocking(expensesCollectionRef, expenseData);
    }
    setIsExpenseFormOpen(false);
  };

  // --- Calculation Engine ---
  const { settlementSummary, ownerSettlementSummary } = useSettlementCalculations(
    drivers || [],
    loads || [],
    expenses || [],
    owners || [],
    weekStart,
    weekEnd,
    driverMap
  );


  const handleExportInvoices = () => {
    if (!loads) return;
    exportInvoicesAsCsv(loads, accounts, weekEnd);
  };

  const handleExportJournal = () => {
    if (!loads) return;
    exportJournalAsCsv(loads, settlementSummary, accounts, weekEnd);
  };


  const loadFileInputRef = React.useRef<HTMLInputElement>(null);
  const expenseFileInputRef = React.useRef<HTMLInputElement>(null);

  const handleGenerateLoadTemplate = () => {
    const csvData = [
      [
        'Load #', 'Driver Name', 'Pickup Date', 'Delivery Date', 'Broker ID',
        'Invoice ID', 'Trailer Number', 'Truck ID',
        'Miles', 'Empty Miles', 'Pickup Location', 'Delivery Location',
        'Invoice Amount', 'Reserve Amount', 'Prime Rate Surcharge', 'Transaction Fee',
        'Factoring Fee', 'Advance', 'Extra Stops', 'Extra Stops Pay'
      ],
      [
        '12345', 'John Doe', '2025-01-01', '2025-01-03', 'BROKER-1',
        'INV-001', 'Trailer-500', 'Truck-101',
        '500', '50', 'Los Angeles, CA', 'New York, NY',
        '1350.00', '0.00', '0.00', '0.00',
        '35.00', '0.00', '2', '75.00'
      ],
    ];
    const csv = Papa.unparse(csvData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'load_import_template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  const handleImportLoadsClick = () => {
    loadFileInputRef.current?.click();
  };

  // Flexible date parser that handles multiple formats and converts to ISO
  const normalizeDateFormat = (dateString: string): string => {
    if (!dateString) return format(new Date(), 'yyyy-MM-dd');

    const trimmed = dateString.trim();

    // 1. Manual Regex for US Short Date which matches "1/15/25"
    const usDateMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (usDateMatch) {
      const month = parseInt(usDateMatch[1], 10);
      const day = parseInt(usDateMatch[2], 10);
      let year = parseInt(usDateMatch[3], 10);

      if (year < 100) year += 2000;

      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }

    // Try multiple common date formats
    const formats = [
      'dd-MMM-yy',        // "23-Jan-25"
      'dd-MMM-yyyy',      // "23-Jan-2025"
      'yyyy-MM-dd',       // "2025-01-23" (ISO)
      'MM/dd/yyyy',       // "01/23/2025" (US)
      'M/d/yyyy',         // "1/23/2025" (US short)
      'dd/MM/yyyy',       // "23/01/2025" (EU)
      'd/M/yyyy',         // "23/1/2025" (EU short)
      'MM-dd-yyyy',       // "01-23-2025"
      'dd.MM.yyyy',       // "23.01.2025"
    ];

    for (const formatStr of formats) {
      try {
        const parsed = parse(trimmed, formatStr, new Date());
        // Check if parse was successful (valid date)
        if (!isNaN(parsed.getTime())) {
          // Convert to our standard format: ISO
          return format(parsed, 'yyyy-MM-dd');
        }
      } catch {
        // Try next format
        continue;
      }
    }

    // If all formats fail, try native Date parsing as last resort
    try {
      const nativeDate = new Date(trimmed);
      if (!isNaN(nativeDate.getTime())) {
        return format(nativeDate, 'dd-MMM-yy');
      }
    } catch {
      // Fall through to default
    }

    // If everything fails, return current date
    console.warn(`Could not parse date: "${dateString}", using current date`);
    return format(new Date(), 'yyyy-MM-dd');
  };

  const handleImportLoads = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        if (results.data && firestore && loadsCollectionRef && drivers) {
          const importedLoads = results.data as any[];
          let successCount = 0;
          let skippedCount = 0;
          const errors: ImportError[] = [];
          const skipped: Array<{ row: number; loadNumber: string }> = [];

          // Get existing load numbers for duplicate detection.
          // IMPORTANT: `loads` is week-filtered in this page, so it can't be trusted for global dedupe.
          // We query Firestore for loadNumbers present in the import file to prevent duplicates across all time.
          const existingLoadNumbers = new Set<string>();
          const importLoadNumbers = Array.from(
            new Set(
              importedLoads
                .map((r) => (r?.['Load #'] ?? '').toString().trim())
                .filter(Boolean)
            )
          );

          try {
            // Firestore 'in' supports up to 30 values.
            for (let i = 0; i < importLoadNumbers.length; i += 30) {
              const chunk = importLoadNumbers.slice(i, i + 30);
              if (chunk.length === 0) continue;
              const qExisting = query(loadsCollectionRef, where('loadNumber', 'in', chunk));
              const snapExisting = await getDocs(qExisting);
              snapExisting.forEach((d) => {
                const ln = (d.data() as any)?.loadNumber;
                if (ln) existingLoadNumbers.add(String(ln).trim());
              });
            }
          } catch (err) {
            console.error('Duplicate pre-check failed (continuing with best-effort dedupe).', err);
            // Fallback: include currently loaded loads (week-scoped) so at least we avoid duplicates in-view.
            (loads || []).forEach((l) => existingLoadNumbers.add(String(l.loadNumber).trim()));
          }

          for (let i = 0; i < importedLoads.length; i++) {
            const row = importedLoads[i];
            const rowNumber = i + 2; // +1 for 0-index, +1 for header row

            if (!row['Load #'] || !row['Driver Name']) {
              // specific check or just skip? Let's skip empty rows silently or add error if it looks like data
              if (Object.values(row).some(v => !!v)) {
                errors.push({ row: rowNumber, data: row, reason: 'Missing Load # or Driver Name' });
              }
              continue;
            }

            // Check for duplicates
            const loadNumber = row['Load #'].toString().trim();
            if (existingLoadNumbers.has(loadNumber)) {
              console.log(`Skipping duplicate load: ${loadNumber}`);
              skipped.push({ row: rowNumber, loadNumber });
              skippedCount++;
              continue;
            }

            // Normalize the driver name from CSV
            const csvDriverName = String(row['Driver Name']).toLowerCase().trim();

            // Find driver with flexible matching
            const driver = drivers.find(d => {
              const dbDriverName = `${d.firstName} ${d.lastName}`.toLowerCase().trim();
              return dbDriverName === csvDriverName;
            });

            if (!driver) {
              // Log available drivers for debugging
              console.warn(`Driver not found for: "${row['Driver Name']}"`);
              console.warn('Available drivers:', drivers.map(d => `${d.firstName} ${d.lastName}`));

              errors.push({
                row: rowNumber,
                data: row,
                reason: `Driver not found: "${row['Driver Name']}". Check spelling and format (e.g., "John Doe").`
              });
              continue;
            }

            console.log(`Matched driver: "${row['Driver Name']}" -> ${driver.firstName} ${driver.lastName}`);

            // Auto-update driver's Unit ID if it changed
            const loadTruckId = row['Truck ID']?.trim();
            if (loadTruckId && driver.unitId !== loadTruckId) {
              console.log(`Updating ${driver.firstName} ${driver.lastName}'s Unit ID: "${driver.unitId}" -> "${loadTruckId}"`);
              const driverDoc = doc(firestore, `companies/${companyId}/drivers`, driver.id);
              await setDocumentNonBlocking(driverDoc, { unitId: loadTruckId }, { merge: true });
              // Update local driver object for subsequent loads in same import
              driver.unitId = loadTruckId;
            }

            // Helper to parse numbers that might have currency symbols, commas, etc.
            // Helper to parse numbers that might have currency symbols, commas, etc.
            // Uses shared parseNumber from utils

            const newLoad = {
              loadNumber: row['Load #'],
              driverId: driver.id,

              pickupDate: normalizeDateFormat(row['Pickup Date']),
              deliveryDate: normalizeDateFormat(row['Delivery Date']),
              brokerId: row['Broker ID'] || '',
              invoiceId: row['Invoice ID'] || '',
              trailerNumber: row['Trailer Number'] || '',
              truckId: row['Truck ID'] || '',

              miles: parseNumber(row['Miles']),
              emptyMiles: parseNumber(row['Empty Miles']),
              pickupLocation: row['Pickup Location'] || '',
              deliveryLocation: row['Delivery Location'] || '',

              invoiceAmount: parseNumber(row['Invoice Amount']),
              reserveAmount: parseNumber(row['Reserve Amount']),
              primeRateSurcharge: parseNumber(row['Prime Rate Surcharge']),
              transactionFee: parseNumber(row['Transaction Fee']),

              factoringFee: parseNumber(row['Factoring Fee']),
              advance: parseNumber(row['Advance']),

              extraStops: parseNumber(row['Extra Stops']) || 0,
              extraStopsPay: parseNumber(row['Extra Stops Pay']) || 0,

              proofOfDeliveryUrl: null,
              rateConfirmationUrl: null,
            };

            console.log('Importing load:', {
              loadNumber: newLoad.loadNumber,
              invoiceAmount: newLoad.invoiceAmount,
              rawValue: row['Invoice Amount']
            });

            if (loadsCollectionRef) {
              await addDocumentNonBlocking(loadsCollectionRef, newLoad);
            }
            existingLoadNumbers.add(loadNumber); // Add to set for current import session
            successCount++;
          }

          setImportResult({ successCount, errors, skippedCount });
          setIsImportResultOpen(true);

          if (loadFileInputRef.current) loadFileInputRef.current.value = '';
        }
      },
      error: (error) => {
        console.error('Error parsing CSV:', error);
        alert('Error parsing CSV file.');
      }
    });
  };

  const handleGenerateExpenseTemplate = () => {
    const csvData = [
      ['Date', 'Description', 'Unit ID', 'Amount', 'Gallons', 'State', 'Bill To (D/O/C)', 'Expense Type'],
      ['2023-10-01', 'Trailer Repair', '1001', '500.00', '', 'NY', 'D', 'Repair'],
      ['2023-10-02', 'Fuel', '1001', '200.00', '50', 'CA', 'C', 'Fuel'],
    ];
    const csv = Papa.unparse(csvData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'expense_import_template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImportExpensesClick = () => {
    expenseFileInputRef.current?.click();
  };

  const handleImportExpenses = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        if (results.data && firestore && expensesCollectionRef && drivers && owners && expenses) {
          const importedExpenses = results.data as any[];
          let successCount = 0;
          let skippedCount = 0;
          const errors: ImportError[] = [];

          const existingSignatures = new Set<string>();

          // 1. Determine Date Range from Import Data
          let minDateStr = '';
          let maxDateStr = '';

          importedExpenses.forEach((row: any) => {
            if (row['Date']) {
              const d = normalizeDateFormat(row['Date']);
              if (!minDateStr || d < minDateStr) minDateStr = d;
              if (!maxDateStr || d > maxDateStr) maxDateStr = d;
            }
          });

          // 2. Fetch Existing Expenses within that Range (if valid)
          if (minDateStr && maxDateStr && expensesCollectionRef) {
            try {
              const q = query(expensesCollectionRef,
                where('date', '>=', minDateStr),
                where('date', '<=', maxDateStr)
              );
              const snapshot = await getDocs(q);
              snapshot.forEach(doc => {
                const e = doc.data() as Expense;
                // Normalize logic matches the check logic
                const sig = `${e.date}|${e.amount.toFixed(2)}|${e.description.toLowerCase().trim()}|${e.unitId?.trim() || ''}`;
                existingSignatures.add(sig);
              });
            } catch (err) {
              console.error("Error checking for duplicates:", err);
              // Proceeding without check? Or abort? Better to warn but we proceed with empty set (risk of dups) 
              // or just rely on current 'expenses' if we merge them.
            }
          }

          // Merge currently loaded expenses just in case (though query covers it if range overlaps)
          expenses.forEach(e => {
            const sig = `${e.date}|${e.amount.toFixed(2)}|${e.description.toLowerCase().trim()}|${e.unitId?.trim() || ''}`;
            existingSignatures.add(sig);
          });




          // Batch variables
          let batch = writeBatch(firestore);
          let batchCount = 0;

          for (const row of importedExpenses) {
            if (!row['Description'] || !row['Amount']) continue;

            const unitId = row['Unit ID']?.trim() || '';
            const billTo = row['Bill To (D/O/C)']?.trim().toUpperCase() || '';

            const matchedDriver = drivers.find(d => d.unitId === unitId);
            const matchedOwner = owners.find(o => o.unitId === unitId);

            let type: 'driver' | 'owner' | 'company' = 'company';

            if (billTo === 'D' || billTo === 'DRIVER') {
              type = 'driver';
            } else if (billTo === 'O' || billTo === 'OWNER') {
              type = 'owner';
            } else if (billTo === 'C' || billTo === 'COMPANY') {
              type = 'company';
            } else {
              // Formatting fallback if Bill To is empty:
              // If it matches a driver, assume driver (standard legacy behavior)
              // If not driver but matches owner, assume owner? 
              // Currently legacy behavior defaults to company if no driver.
              // Let's favor Driver -> Owner -> Company
              if (matchedDriver) type = 'driver';
              else if (matchedOwner) type = 'owner';
              else type = 'company';
            }

            const driverId = (type === 'driver' && matchedDriver) ? matchedDriver.id : null;
            const ownerId = (type === 'owner' && matchedOwner) ? matchedOwner.id : null;

            const gallons = parseFloat(row['Gallons']) || 0;
            const locationState = row['State']?.trim().toUpperCase() || '';
            const expenseCategory = row['Expense Type']?.trim() || 'Fuel'; // Default to Fuel if missing? Or logic based on description?

            // Duplicate Check
            const signature = `${normalizeDateFormat(row['Date'])}|${(parseNumber(row['Amount']) || 0).toFixed(2)}|${row['Description']?.toLowerCase().trim()}|${unitId}`;

            if (existingSignatures.has(signature)) {
              skippedCount++;
              continue;
            }

            const newExpense = {
              date: normalizeDateFormat(row['Date']),
              description: row['Description'],
              amount: parseNumber(row['Amount']) || 0,
              type,
              driverId,
              ownerId,
              unitId,
              gallons,
              locationState,
              expenseCategory,
            };

            if (expensesCollectionRef) {
              // BATCH LOGIC
              if (batchCount === 0) {
                batch = writeBatch(firestore);
              }

              const newDocRef = doc(expensesCollectionRef); // Auto-ID
              batch.set(newDocRef, newExpense);
              existingSignatures.add(signature);

              batchCount++;
              successCount++;

              if (batchCount >= 500) {
                await batch.commit();
                batchCount = 0;
              }
            }
          }

          // Commit any remaining writes
          if (batchCount > 0 && batch) {
            await batch.commit();
          }

          setImportResult({ successCount, errors, skippedCount });
          setIsImportResultOpen(true);
          setIsImporting(false);

          if (expenseFileInputRef.current) expenseFileInputRef.current.value = '';
        } else {
          setIsImporting(false);
        }
      },
      error: (error: any) => {
        console.error('Error parsing CSV:', error);
        alert('Error parsing CSV file: ' + (error.message || String(error)));
        setIsImporting(false);
      }
    });
  };

  const handleExportPDF = async (summary: SettlementSummary | OwnerSettlementSummary, start: Date, end: Date) => {
    try {
      const { generateSettlementPDF } = await import('@/lib/exports/pdf-exports');
      generateSettlementPDF(summary, start, end);
    } catch (error) {
      console.error('Failed to load PDF generator:', error);
      alert('Failed to generate PDF. Please try again.');
    }
  };

  const handleDownloadBatch = async () => {
    if (settlementSummary.length === 0 && ownerSettlementSummary.length === 0) {
      alert("No statements to download.");
      return;
    }

    // Combine both lists
    const allSummaries = [...settlementSummary, ...ownerSettlementSummary];

    if (allSummaries.length > 50 && !confirm(`About to generate ${allSummaries.length} PDFs. This might take a moment. Continue?`)) return;

    try {
      const { generateBatchZip } = await import('@/lib/exports/pdf-exports');
      await generateBatchZip(allSummaries, weekStart, weekEnd);
    } catch (error) {
      console.error('Batch download failed:', error);
      alert('Failed to generate batch archive.');
    }
  };

  const isLoading = loadsLoading || expensesLoading || driversLoading || ownersLoading;


  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8 space-y-8">
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">Weekly Settlement Wizard</h1>
          <p className="text-muted-foreground sm:text-lg">Input weekly loads and expenses to generate QBO-ready CSV files.</p>
        </div>

        <div className="flex flex-col sm:flex-row flex-wrap items-start sm:items-center gap-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="rounded-xl w-full sm:w-auto h-12 px-4 shadow-sm border-border/40">
                <FileDown className="mr-2 h-4 w-4 text-muted-foreground" /> Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-[220px]">
              <DropdownMenuLabel>Export Options</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleExportInvoices} disabled={!loads || loads.length === 0} className="gap-2 cursor-pointer">
                <FileDown className="h-4 w-4 text-muted-foreground" /> Export Invoices
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportJournal} disabled={settlementSummary.length === 0} className="gap-2 cursor-pointer">
                <FileDown className="h-4 w-4 text-muted-foreground" /> Export Journal
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleDownloadBatch} disabled={settlementSummary.length === 0 && ownerSettlementSummary.length === 0} className="gap-2 cursor-pointer">
                <Download className="h-4 w-4 text-muted-foreground" /> Download All Statements
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Week Picker */}
          <div className="flex items-center gap-2 sm:gap-4 bg-muted/30 p-2 rounded-xl border border-border/40 w-full sm:w-auto justify-center">
            <Button variant="ghost" size="icon" onClick={handlePrevWeek} className="h-8 w-8 rounded-lg">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" className="h-8 px-2 rounded-lg hover:bg-muted/50">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium text-sm tabular-nums">
                      {format(weekStart, 'MMM d, yyyy')} - {format(weekEnd, 'MMM d, yyyy')}
                    </span>
                  </div>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="center">
                <CalendarComponent
                  mode="single"
                  selected={selectedWeek}
                  onSelect={handleDateSelect}
                  captionLayout="dropdown"
                  fromYear={new Date().getFullYear() - 10}
                  toYear={new Date().getFullYear()}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
            <Button variant="ghost" size="icon" onClick={handleNextWeek} className="h-8 w-8 rounded-lg">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="mb-6 h-auto flex-wrap p-1 bg-muted/30 rounded-xl border border-border/40">
          <TabsTrigger value="loads" className="h-10 rounded-lg px-4 sm:px-6 data-[state=active]:bg-background data-[state=active]:shadow-sm flex-1 sm:flex-none">Loads ({loads?.length || 0})</TabsTrigger>
          <TabsTrigger value="expenses" className="h-10 rounded-lg px-4 sm:px-6 data-[state=active]:bg-background data-[state=active]:shadow-sm flex-1 sm:flex-none">Expenses ({expenses?.length || 0})</TabsTrigger>
          <TabsTrigger value="summary" className="h-10 rounded-lg px-4 sm:px-6 data-[state=active]:bg-background data-[state=active]:shadow-sm flex-1 sm:flex-none mt-1 sm:mt-0">Settlement Summary</TabsTrigger>
        </TabsList>

        {/* Loads Tab */}
        <TabsContent value="loads" className="space-y-4">
          <Card className="rounded-xl border-border/50 shadow-sm overflow-hidden flex flex-col">
            <div className="border-b border-border/40 p-4 sm:p-6 flex flex-col xl:flex-row gap-6 xl:items-start justify-between bg-muted/30">
              <div className="space-y-1">
                <CardTitle className="font-display">Weekly Loads</CardTitle>
                <CardDescription>All loads completed this settlement period.</CardDescription>
              </div>

              {/* Toolbar */}
              <div className="flex flex-col sm:flex-row gap-4 w-full xl:w-auto">
                {/* Search & Columns - Flexible */}
                <div className="flex gap-2 w-full xl:w-auto flex-col sm:flex-row">
                  <div className="relative w-full sm:w-64">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search for loads..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          if (/^[a-zA-Z0-9-]+$/.test(searchQuery.trim())) {
                            handleGlobalSearch();
                          }
                        }
                      }}
                      className="pl-8 h-9 w-full"
                    />
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="rounded-lg h-9 px-3 w-full sm:w-auto justify-center">
                        <Columns className="h-4 w-4 sm:mr-2" /> <span className="sm:inline">Columns</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-[150px]">
                      <DropdownMenuLabel>Toggle Columns</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {TABLE_COLUMNS.map((column) => (
                        <DropdownMenuCheckboxItem
                          key={column.id}
                          className="capitalize"
                          checked={visibleColumns.has(column.id)}
                          onCheckedChange={(checked) => {
                            const newResult = new Set(visibleColumns);
                            if (checked) {
                              newResult.add(column.id);
                            } else {
                              newResult.delete(column.id);
                            }
                            setVisibleColumns(newResult);
                          }}
                        >
                          {column.label}
                        </DropdownMenuCheckboxItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {/* Actions - Grouped */}
                <div className="flex flex-wrap gap-2 w-full xl:w-auto xl:justify-end">
                  <input type="file" accept=".csv" className="hidden" ref={loadFileInputRef} onChange={handleImportLoads} />
                  <Button variant="outline" size="sm" onClick={handleGenerateLoadTemplate} className="rounded-lg h-9 flex-1 sm:flex-none" title="Download Template">
                    <Download className="h-4 w-4 sm:mr-2" /> <span className="hidden sm:inline">Template</span>
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleImportLoadsClick} className="rounded-lg h-9 flex-1 sm:flex-none" title="Import CSV">
                    <Upload className="h-4 w-4 sm:mr-2" /> <span className="hidden sm:inline">Import</span>
                  </Button>
                  <Button onClick={handleAddLoad} size="sm" className="rounded-lg shadow-sm h-9 flex-1 sm:flex-none">
                    <PlusCircle className="mr-2 h-4 w-4" /> <span className="whitespace-nowrap">Add Load</span>
                  </Button>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-hidden relative">
              <CardContent className="p-0 overflow-x-auto w-full">
                <div className="min-w-[800px]">
                  <Table className="w-full">
                    <TableHeader>
                      <TableRow className="hover:bg-transparent bg-muted/10">
                        {TABLE_COLUMNS.map(column => visibleColumns.has(column.id) && (
                          <TableHead
                            key={column.id}
                            className={`transition-colors duration-200 group ${column.id === 'loadNumber' ? 'pl-6' : ''
                              } ${(column.id === 'pickupDate' || column.id === 'deliveryDate' || column.id === 'driverName') ? 'cursor-pointer hover:bg-muted/30' : ''}`}
                            onClick={() => {
                              if (column.id === 'pickupDate' || column.id === 'deliveryDate' || column.id === 'driverName') {
                                handleSortColumn(column.id as 'pickupDate' | 'deliveryDate' | 'driverName');
                              }
                            }}
                          >
                            <div className="flex items-center justify-between h-full">
                              <div className="flex items-center gap-1 w-full truncate">
                                {column.label}
                                {sortColumn === (column.id === 'driver' ? 'driverName' : column.id) && (
                                  <span className="ml-1 opacity-70">
                                    {sortDirection === 'asc' ? '↑' : '↓'}
                                  </span>
                                )}
                              </div>
                            </div>
                          </TableHead>
                        ))}
                        <TableHead className="w-[50px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {isLoading ? (
                        <TableRow><TableCell colSpan={TABLE_COLUMNS.length + 1} className="h-24 text-center">Loading...</TableCell></TableRow>
                      ) : filteredLoads.length > 0 ? (
                        filteredLoads.map((load) => {
                          const driver = driverMap.get(load.driverId);
                          const isExpanded = expandedRows.has(load.id);
                          return (
                            <React.Fragment key={load.id}>
                              <TableRow
                                className="group hover:bg-muted/50 transition-colors cursor-pointer"
                                onClick={() => {
                                  setExpandedRows(prev => {
                                    const next = new Set(prev);
                                    if (next.has(load.id)) next.delete(load.id);
                                    else next.add(load.id);
                                    return next;
                                  });
                                }}
                              >
                                {TABLE_COLUMNS.map(column => {
                                  if (!visibleColumns.has(column.id)) return null;

                                  return (
                                    <TableCell key={`${load.id}-${column.id}`} className={`${column.id === 'loadNumber' ? 'pl-6 font-medium' : ''}`}>
                                      {(() => {
                                        switch (column.id) {
                                          case 'loadNumber': return (
                                            <div className="flex items-center gap-2">
                                              {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                                              <span className="font-medium">{load.loadNumber}</span>
                                            </div>
                                          );
                                          case 'driver': return driver && (
                                            <div className="flex flex-col">
                                              <span className="font-medium">{toTitleCase(`${driver.firstName} ${driver.lastName}`)}</span>
                                            </div>
                                          );
                                          case 'pickupDate': return new Date(load.pickupDate).toLocaleDateString();
                                          case 'deliveryDate': return new Date(load.deliveryDate).toLocaleDateString();
                                          case 'pickupLocation': return <span className="text-sm text-foreground truncate block max-w-[120px]" title={load.pickupLocation}>{formatLocationShort(load.pickupLocation)}</span>;
                                          case 'deliveryLocation': return <span className="text-sm text-foreground truncate block max-w-[120px]" title={load.deliveryLocation}>{formatLocationShort(load.deliveryLocation)}</span>;
                                          case 'extraStops': return (load.extraStops ?? 0) > 0 ? load.extraStops : '—';
                                          case 'extraStopsPay': return (load.extraStopsPay ?? 0) > 0 ? formatCurrency(load.extraStopsPay!) : '—';
                                          case 'invoiceAmount': return formatCurrency(load.invoiceAmount);
                                          case 'totalPay': return <span className="text-green-600 font-medium">{formatCurrency(calculateDriverPay(load, driver))}</span>;
                                          case 'advance': return formatCurrency(load.advance || 0);
                                          default: return null;
                                        }
                                      })()}
                                    </TableCell>
                                  );
                                })}
                                <TableCell onClick={(e) => e.stopPropagation()}>
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button aria-haspopup="true" size="icon" variant="ghost" className="opacity-0 group-hover:opacity-100 transition-opacity">
                                        <MoreHorizontal className="h-4 w-4" />
                                        <span className="sr-only">Toggle menu</span>
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                      <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                      <DropdownMenuItem onClick={() => handleEditLoad(load)}>Edit</DropdownMenuItem>
                                      <DropdownMenuItem onClick={() => handleDeleteLoad(load.id)} className="text-red-600">Delete</DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </TableCell>
                              </TableRow>
                              {isExpanded && (
                                <TableRow className="bg-muted/10 hover:bg-muted/10">
                                  <TableCell colSpan={TABLE_COLUMNS.length + 1} className="p-0 border-b">
                                    <div className="p-4 pl-6 flex flex-col gap-4 animate-in slide-in-from-top-2">
                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="space-y-1">
                                          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Pick Up Location</p>
                                          <p className="text-sm">{load.pickupLocation || '-'}</p>
                                        </div>
                                        <div className="space-y-1">
                                          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Delivery Location</p>
                                          <p className="text-sm">{load.deliveryLocation || '-'}</p>
                                        </div>
                                      </div>
                                      <div className="space-y-1">
                                        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Attachments</p>
                                        <div className="flex gap-2 items-center">
                                          {load.rateConfirmationUrl ? (
                                            <Button variant="outline" size="sm" className="h-8">
                                              <Paperclip className="h-3 w-3 mr-2" /> Rate Confirmation
                                            </Button>
                                          ) : (
                                            <span className="text-sm text-muted-foreground">No attachments</span>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  </TableCell>
                                </TableRow>
                              )}
                            </React.Fragment>
                          );
                        })
                      ) : (
                        <TableRow>
                          <TableCell colSpan={TABLE_COLUMNS.length + 1} className="h-40 text-center text-muted-foreground">
                            <div className="flex flex-col items-center justify-center gap-3">
                              <p>No loads found in this period.</p>
                              {(searchQuery.trim() && /^[a-zA-Z0-9-]+$/.test(searchQuery.trim())) && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="shadow-sm"
                                  onClick={handleGlobalSearch}
                                  disabled={isSearchingGlobal}
                                >
                                  {isSearchingGlobal ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                                  Search all periods for Load #{searchQuery.trim()}
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </div>
          </Card>
        </TabsContent>

        {/* Expenses Tab */}
        <TabsContent value="expenses" className="space-y-4">
          <Card className="rounded-xl border-border/50 shadow-sm overflow-hidden flex flex-col">
            <div className="border-b border-border/40 p-4 sm:p-6 flex flex-col xl:flex-row gap-6 xl:items-start justify-between bg-muted/30">
              <div className="space-y-1">
                <CardTitle className="font-display">Weekly Expenses & Deductions</CardTitle>
                <CardDescription>Company expenses and driver-specific deductions.</CardDescription>
              </div>

              {/* Toolbar */}
              <div className="flex flex-col sm:flex-row gap-4 w-full xl:w-auto">
                <div className="flex flex-wrap p-1 bg-muted/50 rounded-lg border border-border/50 gap-1 w-full sm:w-auto">
                  <Button
                    variant={expenseFilter === 'all' ? 'secondary' : 'ghost'}
                    size="sm"
                    onClick={() => setExpenseFilter('all')}
                    className="h-8 sm:h-7 text-xs px-3 flex-1 sm:flex-none"
                  >
                    All
                  </Button>
                  <Button
                    variant={expenseFilter === 'driver' ? 'secondary' : 'ghost'}
                    size="sm"
                    onClick={() => setExpenseFilter('driver')}
                    className="h-8 sm:h-7 text-xs px-3 flex-1 sm:flex-none"
                  >
                    Drivers
                  </Button>
                  <Button
                    variant={expenseFilter === 'owner' ? 'secondary' : 'ghost'}
                    size="sm"
                    onClick={() => setExpenseFilter('owner')}
                    className="h-8 sm:h-7 text-xs px-3 flex-1 sm:flex-none"
                  >
                    Owners
                  </Button>
                  <Button
                    variant={expenseFilter === 'company' ? 'secondary' : 'ghost'}
                    size="sm"
                    onClick={() => setExpenseFilter('company')}
                    className="h-8 sm:h-7 text-xs px-3 flex-1 sm:flex-none"
                  >
                    Company
                  </Button>
                </div>
                {/* Actions - Grouped */}
                <div className="flex flex-wrap gap-2 w-full xl:w-auto xl:justify-end">
                  <input type="file" accept=".csv" className="hidden" ref={expenseFileInputRef} onChange={handleImportExpenses} />
                  <Button variant="outline" size="sm" onClick={handleGenerateExpenseTemplate} className="rounded-lg h-9 flex-1 sm:flex-none" title="Download Template">
                    <Download className="h-4 w-4 sm:mr-2" /> <span className="hidden sm:inline">Template</span>
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleImportExpensesClick} disabled={isImporting} className="rounded-lg h-9 flex-1 sm:flex-none" title="Import CSV">
                    <Upload className="h-4 w-4 sm:mr-2" /> <span className="hidden sm:inline">Import</span>
                  </Button>
                  <Button onClick={handleAddExpense} size="sm" className="rounded-lg shadow-sm h-9 flex-1 sm:flex-none">
                    <PlusCircle className="mr-2 h-4 w-4" /> <span className="whitespace-nowrap">Add Expense</span>
                  </Button>
                </div>
              </div>
            </div>
            <div className="flex-1 overflow-hidden relative">
              <CardContent className="p-0 overflow-x-auto w-full">
                <div className="min-w-[800px]">
                  <Table className="w-full">
                    <TableHeader>
                      <TableRow className="hover:bg-transparent bg-muted/10">
                        <TableHead className="pl-6">Date</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Expense Type</TableHead>
                        <TableHead>Bill To</TableHead>
                        <TableHead>Driver</TableHead>
                        <TableHead>Unit ID</TableHead>
                        <TableHead>Gallons</TableHead>
                        <TableHead>State</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead className="w-[80px]"><span className="sr-only">Actions</span></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {isLoading ? (
                        <TableRow><TableCell colSpan={7} className="h-24 text-center">Loading...</TableCell></TableRow>
                      ) : filteredExpenses.length > 0 ? (
                        filteredExpenses.map((expense) => (
                          <TableRow key={expense.id} className="group hover:bg-muted/50 transition-colors">
                            <TableCell className="pl-6">{new Date(expense.date).toLocaleDateString()}</TableCell>
                            <TableCell className="font-medium">{expense.description}</TableCell>
                            <TableCell><Badge variant="outline" className="rounded-md capitalize">{expense.expenseCategory || 'Fuel'}</Badge></TableCell>
                            <TableCell><Badge variant={expense.type === 'company' ? 'secondary' : 'outline'} className="rounded-md capitalize">{expense.type}</Badge></TableCell>
                            <TableCell>
                              {(() => {
                                if (!expense.driverId) return <span className="text-muted-foreground">-</span>;
                                const d = driverMap.get(expense.driverId);
                                return d ? toTitleCase(`${d.firstName} ${d.lastName}`) : <span className="text-muted-foreground">-</span>;
                              })()}
                            </TableCell>
                            <TableCell>
                              {(() => {
                                // Prefer expense.unitId, fall back to driver's unitId
                                if (expense.unitId) return <span className="font-mono text-xs">{expense.unitId}</span>;
                                if (!expense.driverId) return <span className="text-muted-foreground">-</span>;
                                const d = driverMap.get(expense.driverId);
                                return d && d.unitId ? <span className="font-mono text-xs">{d.unitId}</span> : <span className="text-muted-foreground">-</span>;
                              })()}
                            </TableCell>
                            <TableCell>{expense.gallons ? expense.gallons : '-'}</TableCell>
                            <TableCell>{expense.locationState || '-'}</TableCell>
                            <TableCell>{formatCurrency(expense.amount)}</TableCell>
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
                                  <DropdownMenuItem onClick={() => handleEditExpense(expense)}>Edit</DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => handleDeleteExpense(expense.id)} className="text-red-600">Delete</DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow><TableCell colSpan={7} className="h-32 text-center text-muted-foreground">No expenses recorded.</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </div>
          </Card>
        </TabsContent>

        {/* Summary Tab */}
        <TabsContent value="summary" className="space-y-6">
          <Tabs defaultValue="drivers">
            <TabsList className="mb-4 bg-muted/30">
              <TabsTrigger value="drivers" className="px-6">Drivers Settlement</TabsTrigger>
              <TabsTrigger value="owners" className="px-6">Owners Settlement</TabsTrigger>
            </TabsList>

            {/* DRIVERS SUMMARY TABLE */}
            <TabsContent value="drivers" className="space-y-4">
              {/* Aggregate Summary Header for Drivers */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <Card className="bg-blue-50/50 dark:bg-blue-900/20 border-blue-100 dark:border-blue-800">
                  <CardContent className="p-4 flex flex-col items-center justify-center text-center">
                    <span className="text-sm text-blue-600 dark:text-blue-400 font-medium">Total Gross Pay</span>
                    <span className="text-2xl font-bold text-blue-700 dark:text-blue-300">
                      {formatCurrency(settlementSummary.reduce((sum, s) => sum + s.grossPay, 0))}
                    </span>
                  </CardContent>
                </Card>
                <Card className="bg-red-50/50 dark:bg-red-900/20 border-red-100 dark:border-red-800">
                  <CardContent className="p-4 flex flex-col items-center justify-center text-center">
                    <span className="text-sm text-red-600 dark:text-red-400 font-medium">Total Deductions</span>
                    <span className="text-2xl font-bold text-red-700 dark:text-red-300">
                      {formatCurrency(settlementSummary.reduce((sum, s) => sum + s.totalDeductions, 0))}
                    </span>
                  </CardContent>
                </Card>
                <Card className="bg-green-50/50 dark:bg-green-900/20 border-green-100 dark:border-green-800">
                  <CardContent className="p-4 flex flex-col items-center justify-center text-center">
                    <span className="text-sm text-green-600 dark:text-green-400 font-medium">Total Net Pay</span>
                    <span className="text-2xl font-bold text-green-700 dark:text-green-300">
                      {formatCurrency(settlementSummary.reduce((sum, s) => sum + s.netPay, 0))}
                    </span>
                  </CardContent>
                </Card>
              </div>

              {settlementSummary.map(summary => (
                <SettlementCard
                  key={summary.driverId}
                  summary={summary}
                  type="driver"
                  onExportPDF={() => handleExportPDF(summary, weekStart, weekEnd)}
                  driverMap={driverMap}
                />
              ))}
              {settlementSummary.length === 0 && (
                <div className="flex flex-col items-center justify-center h-64 border-2 border-dashed border-border/50 rounded-xl bg-muted/10">
                  <p className="text-muted-foreground">No driver settlements calculated for this period.</p>
                </div>
              )}
            </TabsContent>

            {/* OWNERS SUMMARY TABLE */}
            <TabsContent value="owners" className="space-y-4">
              {/* Aggregate Summary Header for Owners */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <Card className="bg-blue-50/50 dark:bg-blue-900/20 border-blue-100 dark:border-blue-800">
                  <CardContent className="p-4 flex flex-col items-center justify-center text-center">
                    <span className="text-sm text-blue-600 dark:text-blue-400 font-medium">Total Gross Pay</span>
                    <span className="text-2xl font-bold text-blue-700 dark:text-blue-300">
                      {formatCurrency(ownerSettlementSummary.reduce((sum, s) => sum + s.grossPay, 0))}
                    </span>
                  </CardContent>
                </Card>
                <Card className="bg-red-50/50 dark:bg-red-900/20 border-red-100 dark:border-red-800">
                  <CardContent className="p-4 flex flex-col items-center justify-center text-center">
                    <span className="text-sm text-red-600 dark:text-red-400 font-medium">Total Deductions</span>
                    <span className="text-2xl font-bold text-red-700 dark:text-red-300">
                      {formatCurrency(ownerSettlementSummary.reduce((sum, s) => sum + s.totalDeductions, 0))}
                    </span>
                  </CardContent>
                </Card>
                <Card className="bg-green-50/50 dark:bg-green-900/20 border-green-100 dark:border-green-800">
                  <CardContent className="p-4 flex flex-col items-center justify-center text-center">
                    <span className="text-sm text-green-600 dark:text-green-400 font-medium">Total Net Pay</span>
                    <span className="text-2xl font-bold text-green-700 dark:text-green-300">
                      {formatCurrency(ownerSettlementSummary.reduce((sum, s) => sum + s.netPay, 0))}
                    </span>
                  </CardContent>
                </Card>
              </div>

              {/* Render Grouped Owner Settlements */}
              {Object.entries(
                ownerSettlementSummary.reduce((acc, summary) => {
                  const name = summary.ownerName || 'Unknown Owner';
                  if (!acc[name]) acc[name] = [];
                  acc[name].push(summary);
                  return acc;
                }, {} as Record<string, OwnerSettlementSummary[]>)
              ).map(([ownerName, summaries]) => (
                <GroupedOwnerSettlement
                  key={ownerName}
                  ownerName={ownerName}
                  summaries={summaries}
                  onExportPDF={(summary: OwnerSettlementSummary) => handleExportPDF(summary, weekStart, weekEnd)}
                  owners={owners || []}
                />
              ))}

              {ownerSettlementSummary.length === 0 && (
                <div className="flex flex-col items-center justify-center h-64 border-2 border-dashed border-border/50 rounded-xl bg-muted/10">
                  <p className="text-muted-foreground">No owner settlements calculated for this period.</p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </TabsContent>
      </Tabs >

      {/* Forms remain unchanged */}
      < LoadForm
        isOpen={isLoadFormOpen}
        onOpenChange={setIsLoadFormOpen}
        onSave={handleSaveLoad}
        load={editingLoad}
        drivers={drivers || []
        }
      />
      < ExpenseForm
        isOpen={isExpenseFormOpen}
        onOpenChange={setIsExpenseFormOpen}
        onSave={handleSaveExpense}
        expense={editingExpense}
        drivers={drivers || []}
        owners={owners || []}
      />

      <Dialog open={isImporting} onOpenChange={() => { }}>
        <DialogContent className="sm:max-w-xs flex flex-col items-center justify-center space-y-4 py-8 focus:outline-none" onPointerDownOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
          <DialogTitle className="sr-only">Importing Expenses</DialogTitle>
          <Loader2 className="h-10 w-10 text-primary animate-spin" />
          <p className="text-lg font-medium text-center">Importing Expenses...</p>
          <p className="text-sm text-muted-foreground text-center">Please wait while we process the file.</p>
        </DialogContent>
      </Dialog>

      < Dialog open={isImportResultOpen} onOpenChange={setIsImportResultOpen} >
        <DialogContent className="sm:max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Import Results</DialogTitle>
            <DialogDescription>
              Processing complete.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex flex-col gap-2">
              <div className="p-4 rounded-lg bg-green-50 border border-green-100 text-green-700">
                <span className="font-semibold">{importResult?.successCount || 0}</span> loads imported successfully.
              </div>
              {importResult?.skippedCount !== undefined && importResult.skippedCount > 0 && (
                <div className="p-4 rounded-lg bg-yellow-50 border border-yellow-100 text-yellow-700">
                  <span className="font-semibold">{importResult.skippedCount}</span> duplicate loads skipped (already exist).
                </div>
              )}
              {importResult?.errors && importResult.errors.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-semibold text-red-600">Failed to Import ({importResult.errors.length})</h4>
                  <p className="text-sm text-muted-foreground">The following rows were skipped:</p>
                  <div className="border rounded-md overflow-hidden text-sm">
                    <div className="bg-muted/50 p-2 font-medium border-b flex gap-2">
                      <span className="w-16">Row</span>
                      <span className="flex-1">Error</span>
                    </div>
                    <div className="max-h-[300px] overflow-y-auto bg-card">
                      {importResult.errors.map((error, idx) => (
                        <div key={idx} className="p-2 border-b last:border-0 flex gap-2 hover:bg-muted/20">
                          <span className="w-16 text-muted-foreground">#{error.row}</span>
                          <span className="flex-1 text-red-600">{error.reason}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setIsImportResultOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog >
    </div >
  );
}
