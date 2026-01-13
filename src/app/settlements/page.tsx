'use client';

import React, { useState, useMemo } from 'react';
import useLocalStorage from '@/hooks/use-local-storage';
import { PlusCircle, MoreHorizontal, FileDown, Paperclip } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
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

  const driverMap = useMemo(() => new Map(drivers?.map((d) => [d.id, d])), [drivers]);

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

  // --- Expense Management ---
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

    drivers.forEach(driver => {
      const recurringDeductions = [
        { id: `ins-${driver.id}`, description: 'Weekly Insurance', amount: driver.recurringDeductions.insurance, type: 'driver' as const, date: new Date().toISOString(), driverId: driver.id, isRecurring: true },
        { id: `esc-${driver.id}`, description: 'Weekly Escrow', amount: driver.recurringDeductions.escrow, type: 'driver' as const, date: new Date().toISOString(), driverId: driver.id, isRecurring: true }
      ].filter(d => d.amount > 0);

      summaryByDriver.set(driver.id, {
        driverId: driver.id,
        driverName: driver.name,
        grossPay: 0,
        totalDeductions: recurringDeductions.reduce((sum, d) => sum + d.amount, 0),
        netPay: 0,
        loads: [],
        deductions: recurringDeductions,
      });
    });

    loads.forEach(load => {
      const driver = driverMap.get(load.driverId);
      const summary = summaryByDriver.get(load.driverId);
      if (driver && summary) {
        let loadPay = 0;
        if (driver.payType === 'percentage') {
          loadPay = load.linehaul * driver.rate;
        } else {
          if (load.miles) {
            loadPay = load.miles * driver.rate;
          }
        }
        summary.grossPay += loadPay;
        summary.loads.push(load);
      }
    });

    expenses.forEach(expense => {
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
  }, [loads, expenses, drivers, driverMap]);


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
      'Item(Amount)': load.linehaul + load.fuelSurcharge,
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
    const totalRevenue = loads.reduce((sum, l) => sum + l.linehaul + l.fuelSurcharge, 0);
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

  const isLoading = loadsLoading || expensesLoading || driversLoading;


  return (
    <div className="container mx-auto py-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Weekly Settlement Wizard</h1>
          <p className="text-muted-foreground">
            Input weekly loads and expenses to generate QBO-ready CSV files.
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleExportInvoices} variant="outline" disabled={!loads || loads.length === 0}>
            <FileDown className="mr-2 h-4 w-4" /> Export Invoices (CSV)
          </Button>
          <Button onClick={handleExportJournal} variant="outline" disabled={settlementSummary.length === 0}>
            <FileDown className="mr-2 h-4 w-4" /> Export Journal (CSV)
          </Button>
        </div>
      </div>

      <Tabs defaultValue="loads">
        <TabsList className="mb-4">
          <TabsTrigger value="loads">Loads ({loads?.length || 0})</TabsTrigger>
          <TabsTrigger value="expenses">Expenses ({expenses?.length || 0})</TabsTrigger>
          <TabsTrigger value="summary">Settlement Summary ({settlementSummary.length})</TabsTrigger>
        </TabsList>

        {/* Loads Tab */}
        <TabsContent value="loads">
          <Card>
            <CardHeader>
              <CardTitle>Weekly Loads</CardTitle>
              <CardDescription>All loads completed this settlement period.</CardDescription>
              <Button onClick={handleAddLoad} size="sm" className="absolute top-4 right-4">
                <PlusCircle className="mr-2 h-4 w-4" /> Add Load
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Load #</TableHead>
                    <TableHead>Driver</TableHead>
                    <TableHead>Miles</TableHead>
                    <TableHead>Linehaul</TableHead>
                    <TableHead>Fuel Surcharge</TableHead>
                    <TableHead>Factoring Fee</TableHead>
                    <TableHead>Advance</TableHead>
                    <TableHead>Attachments</TableHead>
                    <TableHead><span className="sr-only">Actions</span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={9} className="h-24 text-center">Loading...</TableCell></TableRow>
                  ) : loads && loads.length > 0 ? (
                    loads.map((load) => (
                      <TableRow key={load.id}>
                        <TableCell className="font-medium">{load.loadNumber}</TableCell>
                        <TableCell>{driverMap.get(load.driverId)?.name || 'Unknown'}</TableCell>
                        <TableCell>{load.miles}</TableCell>
                        <TableCell>{formatCurrency(load.linehaul)}</TableCell>
                        <TableCell>{formatCurrency(load.fuelSurcharge)}</TableCell>
                        <TableCell>{formatCurrency(load.factoringFee)}</TableCell>
                        <TableCell>{formatCurrency(load.advance)}</TableCell>
                        <TableCell>
                          {(load.proofOfDeliveryUrl || load.rateConfirmationUrl) && (
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button variant="outline" size="icon">
                                  <Paperclip className="h-4 w-4" />
                                </Button>
                              </DialogTrigger>
                              <DialogContent>
                                <DialogHeader>
                                  <DialogTitle>Attachments for Load #{load.loadNumber}</DialogTitle>
                                </DialogHeader>
                                <div className="py-4 space-y-4">
                                  {load.proofOfDeliveryUrl && (
                                    <div>
                                      <h4 className="font-semibold mb-2">Proof of Delivery</h4>
                                      <a href={load.proofOfDeliveryUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline break-all">
                                        View POD
                                      </a>
                                    </div>
                                  )}
                                  {load.rateConfirmationUrl && (
                                    <div>
                                      <h4 className="font-semibold mb-2">Rate Confirmation</h4>
                                      <a href={load.rateConfirmationUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline break-all">
                                        View Rate Con
                                      </a>
                                    </div>
                                  )}
                                </div>
                              </DialogContent>
                            </Dialog>
                          )}
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button aria-haspopup="true" size="icon" variant="ghost">
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
                    <TableRow><TableCell colSpan={9} className="h-24 text-center">No loads added yet.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Expenses Tab */}
        <TabsContent value="expenses">
          <Card>
            <CardHeader>
              <CardTitle>Weekly Expenses & Deductions</CardTitle>
              <CardDescription>Company expenses and driver-specific deductions.</CardDescription>
              <Button onClick={handleAddExpense} size="sm" className="absolute top-4 right-4">
                <PlusCircle className="mr-2 h-4 w-4" /> Add Expense
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Driver</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead><span className="sr-only">Actions</span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={6} className="h-24 text-center">Loading...</TableCell></TableRow>
                  ) : expenses && expenses.length > 0 ? (
                    expenses.map((expense) => (
                      <TableRow key={expense.id}>
                        <TableCell>{new Date(expense.date).toLocaleDateString()}</TableCell>
                        <TableCell className="font-medium">{expense.description}</TableCell>
                        <TableCell><Badge variant={expense.type === 'company' ? 'secondary' : 'outline'}>{expense.type}</Badge></TableCell>
                        <TableCell>{expense.driverId ? driverMap.get(expense.driverId)?.name : 'N/A'}</TableCell>
                        <TableCell>{formatCurrency(expense.amount)}</TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button aria-haspopup="true" size="icon" variant="ghost">
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
                    <TableRow><TableCell colSpan={6} className="h-24 text-center">No expenses added yet.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Summary Tab */}
        <TabsContent value="summary">
          {settlementSummary.map(summary => (
            <Card key={summary.driverId} className="mb-6">
              <CardHeader>
                <CardTitle>{summary.driverName}'s Settlement</CardTitle>
                <CardDescription>
                  Summary of pay and deductions for this period.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4 text-center mb-6 border-b pb-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Gross Pay</p>
                    <p className="text-2xl font-bold text-green-600">{formatCurrency(summary.grossPay)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total Deductions</p>
                    <p className="text-2xl font-bold text-red-600">{formatCurrency(summary.totalDeductions)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Net Pay</p>
                    <p className="text-2xl font-bold">{formatCurrency(summary.netPay)}</p>
                  </div>
                </div>
                <div className="grid md:grid-cols-2 gap-8">
                  <div>
                    <h4 className="font-semibold mb-2">Loads ({summary.loads.length})</h4>
                    <Table>
                      <TableHeader><TableRow><TableHead>Load #</TableHead><TableHead>Linehaul</TableHead><TableHead>Miles</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {summary.loads.map(l => <TableRow key={l.id}><TableCell>{l.loadNumber}</TableCell><TableCell>{formatCurrency(l.linehaul)}</TableCell><TableCell>{l.miles}</TableCell></TableRow>)}
                      </TableBody>
                    </Table>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-2">Deductions ({summary.deductions.length})</h4>
                    <Table>
                      <TableHeader><TableRow><TableHead>Item</TableHead><TableHead>Amount</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {summary.deductions.map(d => <TableRow key={d.id}><TableCell>{d.description}</TableCell><TableCell>{formatCurrency(d.amount)}</TableCell></TableRow>)}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          {settlementSummary.length === 0 && (
            <div className="flex items-center justify-center h-64 border-2 border-dashed rounded-lg">
              <div className="text-center">
                <h2 className="text-2xl font-semibold">No data yet</h2>
                <p className="text-muted-foreground">Add loads and expenses to see the settlement summary.</p>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

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
    </div>
  );
}
