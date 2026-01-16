'use client';

import React, { useState, useMemo } from 'react';
import useLocalStorage from '@/hooks/use-local-storage';
import { PlusCircle, MoreHorizontal, FileDown, Paperclip, Download, Upload, Columns, Search, ChevronLeft, ChevronRight, Calendar, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { startOfWeek, endOfWeek, addWeeks, subWeeks, format, isWithinInterval, parseISO, parse } from 'date-fns';
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
import type { Load, Driver, Expense, AccountSettings } from '@/lib/types';
import { LS_KEYS, DEFAULT_ACCOUNTS } from '@/lib/constants';
import { formatCurrency, downloadCsv } from '@/lib/utils';
import Papa from 'papaparse';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, doc } from 'firebase/firestore';
import { addDocumentNonBlocking, deleteDocumentNonBlocking, setDocumentNonBlocking } from '@/firebase/non-blocking-updates';


export type SettlementSummary = {
  driverId: string;
  driverName: string;
  grossPay: number;
  totalDeductions: number;
  netPay: number;
  loads: Load[];
  deductions: (Expense & { isRecurring?: boolean })[];
};

type ImportError = {
  row: number;
  data: any;
  reason: string;
};

type ImportResult = {
  successCount: number;
  errors: ImportError[];
  skippedCount?: number;
};

// --- Helper Functions ---
const calculateDriverPay = (load: Load, driver?: Driver) => {
  if (!driver) return 0;
  if (driver.payType === 'percentage') {
    return load.invoiceAmount * driver.rate;
  }
  return (load.miles || 0) * driver.rate;
};

const TABLE_COLUMNS = [
  { id: 'loadNumber', label: 'Load #' },
  { id: 'driver', label: 'Driver' },
  { id: 'pickupDate', label: 'Pickup Date' },
  { id: 'deliveryDate', label: 'Delivery Date' },
  { id: 'pickupLocation', label: 'Pick Up Location' },
  { id: 'deliveryLocation', label: 'Delivery Location' },
  { id: 'invoiceAmount', label: 'Invoice Amt' },
  { id: 'totalPay', label: 'Total Pay' },
  { id: 'advance', label: 'Advance' },
  { id: 'attachments', label: 'Attachments' },
];

export default function SettlementsPage() {
  const firestore = useFirestore();

  const loadsCollection = useMemoFirebase(() => firestore ? collection(firestore, 'loads') : null, [firestore]);
  const expensesCollection = useMemoFirebase(() => firestore ? collection(firestore, 'expenses') : null, [firestore]);
  const driversCollection = useMemoFirebase(() => firestore ? collection(firestore, 'drivers') : null, [firestore]);

  const { data: loads, loading: loadsLoading } = useCollection<Load>(loadsCollection);
  const { data: expenses, loading: expensesLoading } = useCollection<Expense>(expensesCollection);
  const { data: drivers, loading: driversLoading } = useCollection<Driver>(driversCollection);

  const [accounts] = useLocalStorage<AccountSettings>(LS_KEYS.ACCOUNTS, DEFAULT_ACCOUNTS);

  const [isLoadFormOpen, setIsLoadFormOpen] = useState(false);
  const [editingLoad, setEditingLoad] = useState<Load | undefined>(undefined);
  const [isExpenseFormOpen, setIsExpenseFormOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | undefined>(undefined);

  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(new Set(TABLE_COLUMNS.map(c => c.id)));
  const [searchQuery, setSearchQuery] = useState('');

  const [selectedWeek, setSelectedWeek] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 })); // Monday start

  const weekStart = useMemo(() => selectedWeek, [selectedWeek]);
  const weekEnd = useMemo(() => endOfWeek(selectedWeek, { weekStartsOn: 1 }), [selectedWeek]);

  const handlePrevWeek = () => setSelectedWeek(prev => subWeeks(prev, 1));
  const handleNextWeek = () => setSelectedWeek(prev => addWeeks(prev, 1));
  const handleDateSelect = (date: Date | undefined) => {
    if (date) {
      setSelectedWeek(startOfWeek(date, { weekStartsOn: 1 }));
    }
  };

  // --- Column Resizing ---
  const [colWidths, setColWidths] = useState<Record<string, number>>({
    loadNumber: 100,
    driver: 180,
    pickupDate: 120,
    deliveryDate: 120,
    pickupLocation: 200,
    deliveryLocation: 200,
    invoiceAmount: 120,
    totalPay: 120,
    advance: 100,
    attachments: 120,
  });

  const [resizingColId, setResizingColId] = useState<string | null>(null);

  const handleResizeStart = (e: React.MouseEvent, colId: string) => {
    e.preventDefault();
    setResizingColId(colId);
    const startX = e.clientX;
    const startWidth = colWidths[colId] || 100;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX;
      setColWidths(prev => ({
        ...prev,
        [colId]: Math.max(50, startWidth + delta), // Minimum width 50px
      }));
    };

    const handleMouseUp = () => {
      setResizingColId(null);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const driverMap = useMemo(() => new Map(drivers?.map((d) => [d.id, d])), [drivers]);

  // Filter loads based on search query and selected week
  const filteredLoads = useMemo(() => {
    if (!loads) return [];

    const weekInterval = { start: weekStart, end: weekEnd };

    return loads.filter(load => {
      // Date Filter: pickupDate must be within selected week
      const loadDate = parse(load.pickupDate, 'dd-MMM-yy', new Date());
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
    });
  }, [loads, searchQuery, driverMap, weekStart, weekEnd]);

  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [isImportResultOpen, setIsImportResultOpen] = useState(false);



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
    if (firestore && confirm('Are you sure you want to delete this load?')) {
      deleteDocumentNonBlocking(doc(firestore, 'loads', loadId));
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
    };

    if (firestore && loadsCollection) {
      if (editingLoad) {
        const loadDoc = doc(firestore, 'loads', editingLoad.id);
        setDocumentNonBlocking(loadDoc, dataToSave, { merge: true });
      } else {
        addDocumentNonBlocking(loadsCollection, dataToSave);
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
    if (firestore && confirm('Are you sure you want to delete this expense?')) {
      deleteDocumentNonBlocking(doc(firestore, 'expenses', expenseId));
    }
  };
  const handleSaveExpense = async (expenseData: Omit<Expense, 'id'>) => {
    if (!firestore || !expensesCollection) return;
    if (editingExpense) {
      setDocumentNonBlocking(doc(firestore, 'expenses', editingExpense.id), expenseData, { merge: true });
    } else {
      addDocumentNonBlocking(expensesCollection, expenseData);
    }
    setIsExpenseFormOpen(false);
  };

  // --- Calculation Engine ---
  const settlementSummary = useMemo<SettlementSummary[]>(() => {
    if (!drivers || !loads || !expenses) return [];

    const summaryByDriver: Map<string, SettlementSummary> = new Map();
    const weekInterval = { start: weekStart, end: weekEnd };
    const recurringDate = weekEnd.toISOString(); // Use end of week for recurring deductions

    drivers.forEach(driver => {
      const recurringDeductions = [
        { id: `ins-${driver.id}`, description: 'Weekly Insurance', amount: driver.recurringDeductions.insurance, type: 'driver' as const, date: recurringDate, driverId: driver.id, isRecurring: true },
        { id: `esc-${driver.id}`, description: 'Weekly Escrow', amount: driver.recurringDeductions.escrow, type: 'driver' as const, date: recurringDate, driverId: driver.id, isRecurring: true }
      ].filter(d => d.amount > 0);

      summaryByDriver.set(driver.id, {
        driverId: driver.id,
        driverName: `${driver.firstName} ${driver.lastName}`,
        grossPay: 0,
        totalDeductions: recurringDeductions.reduce((sum, d) => sum + d.amount, 0),
        netPay: 0,
        loads: [],
        deductions: recurringDeductions,
      });
    });

    loads.forEach(load => {
      // Filter load by week
      if (!isWithinInterval(parseISO(load.deliveryDate), weekInterval)) return;

      const driver = driverMap.get(load.driverId);
      const summary = summaryByDriver.get(load.driverId);
      if (driver && summary) {
        const loadPay = calculateDriverPay(load, driver);
        summary.grossPay += loadPay;
        summary.loads.push(load);
      }
    });

    expenses.forEach(expense => {
      // Filter expense by week
      if (!isWithinInterval(parseISO(expense.date), weekInterval)) return;

      if (expense.type === 'driver' && expense.driverId) {
        const summary = summaryByDriver.get(expense.driverId);
        if (summary) {
          summary.totalDeductions += expense.amount;
          summary.deductions.push(expense);
        }
      }
    });

    summaryByDriver.forEach(summary => {
      summary.netPay = summary.grossPay - summary.totalDeductions;
    });

    return Array.from(summaryByDriver.values()).filter(s => s.loads.length > 0 || s.deductions.some(d => !d.isRecurring));
  }, [loads, expenses, drivers, driverMap, weekStart, weekEnd]);


  // --- CSV Export ---
  const handleExportInvoices = () => {
    if (!loads) return;
    const today = new Date().toISOString().split('T')[0];
    const invoiceData = loads.map(load => ({
      InvoiceNo: load.loadNumber,
      Customer: accounts.factoringCompany,
      'Invoice Date': today,
      'Due Date': today,
      'Item(Description)': 'Freight',
      'Item(Amount)': load.invoiceAmount,
      'Class': 'Revenue'
    }));

    const csv = Papa.unparse(invoiceData);
    downloadCsv(csv, `QBO_Invoices_${today}.csv`);
  };

  const handleExportJournal = () => {
    if (!loads) return;
    const today = new Date().toISOString().split('T')[0];
    const journalEntries: any[] = [];
    let journalNo = 1;

    // 1. Factoring Entry
    const totalRevenue = loads.reduce((sum, l) => sum + l.invoiceAmount, 0);
    const totalFactoringFees = loads.reduce((sum, l) => sum + l.factoringFee, 0);

    journalEntries.push({ JournalNo: journalNo, 'Journal Date': today, Account: accounts.factoringClearing, Debits: totalRevenue - totalFactoringFees, Credits: '', Name: accounts.factoringCompany, Description: 'Weekly factoring deposit' });
    journalEntries.push({ JournalNo: journalNo, 'Journal Date': today, Account: accounts.factoringFees, Debits: totalFactoringFees, Credits: '', Name: '', Description: 'Weekly factoring fees' });
    journalEntries.push({ JournalNo: journalNo, 'Journal Date': today, Account: 'Accounts Receivable', Debits: '', Credits: totalRevenue, Name: accounts.factoringCompany, Description: 'To clear factored invoices' });
    journalNo++;

    // 2. Driver Pay & Deductions Entries
    settlementSummary.forEach(summary => {
      if (summary.grossPay > 0) {
        journalEntries.push({ JournalNo: journalNo, 'Journal Date': today, Account: accounts.driverPayExpense, Debits: summary.grossPay, Credits: '', Name: summary.driverName, Description: `Gross pay for ${summary.driverName}` });
        journalEntries.push({ JournalNo: journalNo, 'Journal Date': today, Account: accounts.accruedDriverPay, Debits: '', Credits: summary.grossPay, Name: summary.driverName, Description: `To accrue pay for ${summary.driverName}` });
        journalNo++;
      }

      summary.deductions.forEach(deduction => {
        if (deduction.amount <= 0) return;
        let creditAccount = '';
        if (deduction.description.toLowerCase().includes('insurance')) {
          // Assuming insurance is paid out from a specific payable account
        } else if (deduction.description.toLowerCase().includes('escrow')) {
          creditAccount = accounts.escrowPayable;
        } else if (deduction.description.toLowerCase().includes('fuel') || deduction.description.toLowerCase().includes('advance')) {
          creditAccount = accounts.fuelAdvancesReceivable;
        } else {
          // Other deductions might go to a general 'Deductions Payable' or similar
        }

        if (creditAccount) { // Only create entry if we have a defined credit account
          journalEntries.push({ JournalNo: journalNo, 'Journal Date': today, Account: accounts.accruedDriverPay, Debits: deduction.amount, Credits: '', Name: summary.driverName, Description: `Deduction: ${deduction.description}` });
          journalEntries.push({ JournalNo: journalNo, 'Journal Date': today, Account: creditAccount, Debits: '', Credits: deduction.amount, Name: summary.driverName, Description: `To record deduction for ${summary.driverName}` });
          journalNo++;
        }
      });
    });


    const csv = Papa.unparse(journalEntries);
    downloadCsv(csv, `QBO_Journal_${today}.csv`);
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
        'Factoring Fee', 'Advance'
      ],
      [
        '12345', 'John Doe', '2025-01-01', '2025-01-03', 'BROKER-1',
        'INV-001', 'Trailer-500', 'Truck-101',
        '500', '50', 'Los Angeles, CA', 'New York, NY',
        '1350.00', '0.00', '0.00', '0.00',
        '35.00', '0.00'
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

  // Flexible date parser that handles multiple formats and converts to dd-MMM-yy
  const normalizeDateFormat = (dateString: string): string => {
    if (!dateString) return format(new Date(), 'dd-MMM-yy');

    const trimmed = dateString.trim();

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
          // Convert to our standard format: dd-MMM-yy
          return format(parsed, 'dd-MMM-yy');
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
    return format(new Date(), 'dd-MMM-yy');
  };

  const handleImportLoads = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        if (results.data && firestore && loadsCollection && drivers) {
          const importedLoads = results.data as any[];
          let successCount = 0;
          let skippedCount = 0;
          const errors: ImportError[] = [];
          const skipped: Array<{ row: number; loadNumber: string }> = [];

          // Get existing load numbers for duplicate detection
          const existingLoadNumbers = new Set(loads?.map(l => l.loadNumber) || []);

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
              const driverDoc = doc(firestore, 'drivers', driver.id);
              await setDocumentNonBlocking(driverDoc, { unitId: loadTruckId }, { merge: true });
              // Update local driver object for subsequent loads in same import
              driver.unitId = loadTruckId;
            }

            // Helper to parse numbers that might have currency symbols, commas, etc.
            const parseNumber = (value: string | number): number => {
              if (typeof value === 'number') return value;
              if (!value) return 0;
              // Remove currency symbols, commas, whitespace
              const cleaned = String(value).replace(/[$,\s]/g, '').trim();
              const parsed = parseFloat(cleaned);
              return isNaN(parsed) ? 0 : parsed;
            };

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

              proofOfDeliveryUrl: null,
              rateConfirmationUrl: null,
            };

            console.log('Importing load:', {
              loadNumber: newLoad.loadNumber,
              invoiceAmount: newLoad.invoiceAmount,
              rawValue: row['Invoice Amount']
            });

            await addDocumentNonBlocking(loadsCollection, newLoad);
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
      ['Date', 'Description', 'Type', 'Driver Name', 'Amount'],
      ['2023-10-01', 'Trailer Repair', 'company', '', '500.00'],
      ['2023-10-02', 'Fuel Advance', 'driver', 'John Doe', '200.00'],
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

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        if (results.data && firestore && expensesCollection && drivers) {
          const importedExpenses = results.data as any[];
          let successCount = 0;

          for (const row of importedExpenses) {
            if (!row['Description'] || !row['Amount']) continue;

            const type = row['Type']?.toLowerCase() === 'driver' ? 'driver' : 'company';
            let driverId: string | undefined = undefined;

            if (type === 'driver' && row['Driver Name']) {
              const driver = drivers.find(d => `${d.firstName} ${d.lastName}`.toLowerCase().trim() === row['Driver Name'].toLowerCase().trim());
              if (driver) {
                driverId = driver.id;
              } else {
                // Fallback or warning if driver not found but type is driver
                console.warn(`Driver not found for expense: ${row['Driver Name']}`);
              }
            }

            const newExpense = {
              date: row['Date'] || new Date().toISOString(),
              description: row['Description'],
              amount: parseFloat(row['Amount']) || 0,
              type,
              driverId,
            };

            await addDocumentNonBlocking(expensesCollection, newExpense);
            successCount++;
          }
          alert(`Imported ${successCount} expenses.`);
          if (expenseFileInputRef.current) expenseFileInputRef.current.value = '';
        }
      },
      error: (error) => {
        console.error('Error parsing CSV:', error);
        alert('Error parsing CSV file.');
      }
    });
  };

  const isLoading = loadsLoading || expensesLoading || driversLoading;


  return (
    <div className="container mx-auto py-8 space-y-8">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">Weekly Settlement Wizard</h1>
          <p className="text-muted-foreground text-lg">Input weekly loads and expenses to generate QBO-ready CSV files.</p>
        </div>

        {/* Week Picker */}
        <div className="flex items-center gap-4 bg-muted/30 p-2 rounded-xl border border-border/40">
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

        <div className="flex gap-2">
          <Button onClick={handleExportInvoices} variant="outline" disabled={!loads || loads.length === 0} className="rounded-xl">
            <FileDown className="mr-2 h-4 w-4" /> Export Invoices
          </Button>
          <Button onClick={handleExportJournal} variant="outline" disabled={settlementSummary.length === 0} className="rounded-xl">
            <FileDown className="mr-2 h-4 w-4" /> Export Journal
          </Button>
        </div>
      </div>

      <Tabs defaultValue="loads" className="w-full">
        <TabsList className="mb-6 h-12 p-1 bg-muted/30 rounded-xl border border-border/40">
          <TabsTrigger value="loads" className="h-full rounded-lg px-6 data-[state=active]:bg-background data-[state=active]:shadow-sm">Loads ({loads?.length || 0})</TabsTrigger>
          <TabsTrigger value="expenses" className="h-full rounded-lg px-6 data-[state=active]:bg-background data-[state=active]:shadow-sm">Expenses ({expenses?.length || 0})</TabsTrigger>
          <TabsTrigger value="summary" className="h-full rounded-lg px-6 data-[state=active]:bg-background data-[state=active]:shadow-sm">Settlement Summary</TabsTrigger>
        </TabsList>

        {/* Loads Tab */}
        <TabsContent value="loads" className="space-y-4">
          <Card className="rounded-xl border-border/50 shadow-sm overflow-hidden">
            <CardHeader className="bg-muted/30 border-b border-border/40 flex flex-row items-center justify-between">
              <div className="space-y-1">
                <CardTitle className="font-display">Weekly Loads</CardTitle>
                <CardDescription>All loads completed this settlement period.</CardDescription>
              </div>
              <div className="flex gap-2 items-center">
                <div className="relative w-64 mr-2">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search loads..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8 h-9"
                  />
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="rounded-lg">
                      <Columns className="mr-2 h-4 w-4" /> Columns
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
                <input type="file" accept=".csv" className="hidden" ref={loadFileInputRef} onChange={handleImportLoads} />
                <Button variant="outline" size="sm" onClick={handleGenerateLoadTemplate} className="rounded-lg">
                  <Download className="mr-2 h-4 w-4" /> Template
                </Button>
                <Button variant="outline" size="sm" onClick={handleImportLoadsClick} className="rounded-lg">
                  <Upload className="mr-2 h-4 w-4" /> Import CSV
                </Button>
                <Button onClick={handleAddLoad} size="sm" className="rounded-lg shadow-sm">
                  <PlusCircle className="mr-2 h-4 w-4" /> Add Load
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0 overflow-auto">
              <Table style={{ tableLayout: 'fixed', width: '100%' }}>
                <TableHeader>
                  <TableRow className="hover:bg-transparent bg-muted/10">
                    {TABLE_COLUMNS.map(column => visibleColumns.has(column.id) && (
                      <TableHead
                        key={column.id}
                        style={{ width: colWidths[column.id], position: 'relative' }}
                        className={`transition-colors duration-200 group ${column.id === 'loadNumber' ? 'pl-6' : ''
                          } ${resizingColId === column.id ? 'bg-muted/50 border-r-2 border-primary' : ''}`}
                      >
                        <div className="flex items-center justify-between h-full">
                          <span className="">{column.label}</span>

                          {/* Resize Handle */}
                          <div
                            className={`absolute right-0 top-0 bottom-0 w-4 flex items-center justify-center cursor-col-resize select-none opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity ${resizingColId === column.id ? 'opacity-100' : ''}`}
                            onMouseDown={(e) => handleResizeStart(e, column.id)}
                          >
                            <GripVertical className="h-4 w-4 text-muted-foreground/50 hover:text-primary" />
                          </div>
                        </div>
                      </TableHead>
                    ))}
                    <TableHead className="w-[80px]"><span className="sr-only">Actions</span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        {visibleColumns.has('loadNumber') && <TableCell><Skeleton className="h-4 w-12" /></TableCell>}
                        {visibleColumns.has('driver') && <TableCell><Skeleton className="h-4 w-24" /></TableCell>}
                        {visibleColumns.has('pickupDate') && <TableCell><Skeleton className="h-4 w-12" /></TableCell>}
                        {visibleColumns.has('deliveryDate') && <TableCell><Skeleton className="h-4 w-16" /></TableCell>}
                        {visibleColumns.has('pickupLocation') && <TableCell><Skeleton className="h-4 w-16" /></TableCell>}
                        {visibleColumns.has('deliveryLocation') && <TableCell><Skeleton className="h-4 w-16" /></TableCell>}
                        {visibleColumns.has('invoiceAmount') && <TableCell><Skeleton className="h-4 w-16" /></TableCell>}
                        {visibleColumns.has('totalPay') && <TableCell><Skeleton className="h-8 w-8" /></TableCell>}
                        {visibleColumns.has('advance') && <TableCell><Skeleton className="h-4 w-12" /></TableCell>}
                        {visibleColumns.has('attachments') && <TableCell><Skeleton className="h-8 w-8 rounded-full" /></TableCell>}
                        <TableCell><Skeleton className="h-8 w-8 rounded-full" /></TableCell>
                      </TableRow>
                    ))
                  ) : filteredLoads && filteredLoads.length > 0 ? (
                    filteredLoads.map((load) => (
                      <TableRow key={load.id} className="group hover:bg-muted/50 transition-colors">
                        {TABLE_COLUMNS.map(column => {
                          if (!visibleColumns.has(column.id)) return null;

                          return (
                            <TableCell key={column.id} className={`${column.id === 'loadNumber' ? 'pl-6 font-medium' : ''}`}>
                              {(() => {
                                switch (column.id) {
                                  case 'loadNumber': return load.loadNumber;
                                  case 'driver':
                                    const d = driverMap.get(load.driverId);
                                    return d ? `${d.firstName} ${d.lastName}` : 'Unknown';
                                  case 'pickupDate': return new Date(load.pickupDate).toLocaleDateString();
                                  case 'deliveryDate': return new Date(load.deliveryDate).toLocaleDateString();
                                  case 'pickupLocation': return load.pickupLocation;
                                  case 'deliveryLocation': return load.deliveryLocation;
                                  case 'invoiceAmount': return formatCurrency(load.invoiceAmount);
                                  case 'totalPay':
                                    const pay = calculateDriverPay(load, driverMap.get(load.driverId));
                                    return <span className="font-semibold text-green-600">{formatCurrency(pay)}</span>;
                                  case 'advance': return formatCurrency(load.advance);
                                  case 'attachments':
                                    return (load.proofOfDeliveryUrl || load.rateConfirmationUrl) ? (
                                      <Dialog>
                                        <DialogTrigger asChild>
                                          <Button variant="outline" size="sm" className="h-8 w-8 p-0 rounded-full">
                                            <Paperclip className="h-4 w-4" />
                                          </Button>
                                        </DialogTrigger>
                                        <DialogContent>
                                          <DialogHeader>
                                            <DialogTitle>Attachments for Load #{load.loadNumber}</DialogTitle>
                                          </DialogHeader>
                                          <div className="py-4 space-y-4">
                                            {load.proofOfDeliveryUrl && (
                                              <div className="p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                                                <h4 className="font-semibold mb-1 text-sm">Proof of Delivery</h4>
                                                <a href={load.proofOfDeliveryUrl} target="_blank" rel="noopener noreferrer" className="text-primary text-sm hover:underline break-all">
                                                  View POD
                                                </a>
                                              </div>
                                            )}
                                            {load.rateConfirmationUrl && (
                                              <div className="p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                                                <h4 className="font-semibold mb-1 text-sm">Rate Confirmation</h4>
                                                <a href={load.rateConfirmationUrl} target="_blank" rel="noopener noreferrer" className="text-primary text-sm hover:underline break-all">
                                                  View Rate Con
                                                </a>
                                              </div>
                                            )}
                                          </div>
                                        </DialogContent>
                                      </Dialog>
                                    ) : null;
                                  default: return null;
                                }
                              })()}
                            </TableCell>
                          );
                        })}
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
                              <DropdownMenuItem onClick={() => handleEditLoad(load)}>Edit</DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleDeleteLoad(load.id)} className="text-red-600">Delete</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow><TableCell colSpan={9} className="h-32 text-center text-muted-foreground">No loads added yet.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Expenses Tab */}
        <TabsContent value="expenses">
          <Card className="rounded-xl border-border/50 shadow-sm overflow-hidden">
            <CardHeader className="bg-muted/30 border-b border-border/40 flex flex-row items-center justify-between">
              <div className="space-y-1">
                <CardTitle className="font-display">Weekly Expenses & Deductions</CardTitle>
                <CardDescription>Company expenses and driver-specific deductions.</CardDescription>
              </div>
              <div className="flex gap-2">
                <input type="file" accept=".csv" className="hidden" ref={expenseFileInputRef} onChange={handleImportExpenses} />
                <Button variant="outline" size="sm" onClick={handleGenerateExpenseTemplate} className="rounded-lg">
                  <Download className="mr-2 h-4 w-4" /> Template
                </Button>
                <Button variant="outline" size="sm" onClick={handleImportExpensesClick} className="rounded-lg">
                  <Upload className="mr-2 h-4 w-4" /> Import CSV
                </Button>
                <Button onClick={handleAddExpense} size="sm" className="rounded-lg shadow-sm">
                  <PlusCircle className="mr-2 h-4 w-4" /> Add Expense
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent bg-muted/10">
                    <TableHead className="pl-6">Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Driver</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead className="w-[80px]"><span className="sr-only">Actions</span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={6} className="h-24 text-center">Loading...</TableCell></TableRow>
                  ) : expenses && expenses.length > 0 ? (
                    expenses.map((expense) => (
                      <TableRow key={expense.id} className="group hover:bg-muted/50 transition-colors">
                        <TableCell className="pl-6">{new Date(expense.date).toLocaleDateString()}</TableCell>
                        <TableCell className="font-medium">{expense.description}</TableCell>
                        <TableCell><Badge variant={expense.type === 'company' ? 'secondary' : 'outline'} className="rounded-md capitalize">{expense.type}</Badge></TableCell>
                        <TableCell>
                          {(() => {
                            if (!expense.driverId) return <span className="text-muted-foreground">-</span>;
                            const d = driverMap.get(expense.driverId);
                            return d ? `${d.firstName} ${d.lastName}` : <span className="text-muted-foreground">-</span>;
                          })()}
                        </TableCell>
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
                    <TableRow><TableCell colSpan={6} className="h-32 text-center text-muted-foreground">No expenses added yet.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Summary Tab */}
        <TabsContent value="summary" className="space-y-4">
          {settlementSummary.map(summary => (
            <Card key={summary.driverId} className="rounded-xl border-border/50 shadow-sm overflow-hidden">
              <CardHeader className="bg-muted/30 border-b border-border/40">
                <CardTitle className="font-display">{summary.driverName}'s Settlement</CardTitle>
                <CardDescription>
                  Summary of pay and deductions for this period.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center mb-8 pb-8 border-b border-border/40">
                  <div className="p-4 bg-muted/20 rounded-xl">
                    <p className="text-sm font-medium text-muted-foreground mb-1">Gross Pay</p>
                    <p className="text-3xl font-bold text-green-600">{formatCurrency(summary.grossPay)}</p>
                  </div>
                  <div className="p-4 bg-muted/20 rounded-xl">
                    <p className="text-sm font-medium text-muted-foreground mb-1">Total Deductions</p>
                    <p className="text-3xl font-bold text-red-600">{formatCurrency(summary.totalDeductions)}</p>
                  </div>
                  <div className="p-4 bg-primary/5 rounded-xl border border-primary/10">
                    <p className="text-sm font-medium text-foreground mb-1">Net Pay</p>
                    <p className="text-3xl font-bold text-primary">{formatCurrency(summary.netPay)}</p>
                  </div>
                </div>
                <div className="grid md:grid-cols-2 gap-8">
                  <div>
                    <h4 className="font-semibold mb-4 text-sm uppercase tracking-wider text-muted-foreground">Loads ({summary.loads.length})</h4>
                    <div className="rounded-lg border overflow-hidden">
                      <Table>
                        <TableHeader><TableRow className="bg-muted/50"><TableHead>Load #</TableHead><TableHead>Loc</TableHead><TableHead className="text-right">Total Pay</TableHead></TableRow></TableHeader>
                        <TableBody>
                          {summary.loads.map(l => (
                            <TableRow key={l.id} className="hover:bg-muted/20">
                              <TableCell>{l.loadNumber}</TableCell>
                              <TableCell className="text-xs">{l.deliveryLocation}</TableCell>
                              <TableCell className="text-right font-medium">{formatCurrency(calculateDriverPay(l, driverMap.get(l.driverId)))}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-4 text-sm uppercase tracking-wider text-muted-foreground">Deductions ({summary.deductions.length})</h4>
                    <div className="rounded-lg border overflow-hidden">
                      <Table>
                        <TableHeader><TableRow className="bg-muted/50"><TableHead>Item</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
                        <TableBody>
                          {summary.deductions.map(d => <TableRow key={d.id} className="hover:bg-muted/20"><TableCell>{d.description}</TableCell><TableCell className="text-right">{formatCurrency(d.amount)}</TableCell></TableRow>)}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          {settlementSummary.length === 0 && (
            <div className="flex flex-col items-center justify-center h-64 border-2 border-dashed border-border/50 rounded-xl bg-muted/10">
              <div className="text-center space-y-2">
                <FileDown className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-50" />
                <h2 className="text-xl font-semibold">No Settlement Data</h2>
                <p className="text-muted-foreground max-w-sm mx-auto">Add loads and expenses to generate the weekly settlement summary.</p>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Forms remain unchanged */}
      <LoadForm
        isOpen={isLoadFormOpen}
        onOpenChange={setIsLoadFormOpen}
        onSave={handleSaveLoad}
        load={editingLoad}
        drivers={drivers || []}
      />
      <ExpenseForm
        isOpen={isExpenseFormOpen}
        onOpenChange={setIsExpenseFormOpen}
        onSave={handleSaveExpense}
        expense={editingExpense}
        drivers={drivers || []}
      />

      <Dialog open={isImportResultOpen} onOpenChange={setIsImportResultOpen}>
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
                <span className="font-semibold">{importResult?.successCount}</span> loads imported successfully.
              </div>
              {importResult && importResult.skippedCount && importResult.skippedCount > 0 && (
                <div className="p-4 rounded-lg bg-yellow-50 border border-yellow-100 text-yellow-700">
                  <span className="font-semibold">{importResult.skippedCount}</span> duplicate loads skipped (already exist).
                </div>
              )}
              {importResult && importResult.errors.length > 0 && (
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
      </Dialog>
    </div>
  );
}
