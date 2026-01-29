
import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { FileDown } from 'lucide-react';
import { formatCurrency, calculateDriverPay } from '@/lib/utils';
import type { SettlementSummary, OwnerSettlementSummary, Driver, Owner } from '@/lib/types';

interface SettlementCardProps {
    summary: SettlementSummary | OwnerSettlementSummary;
    type: 'driver' | 'owner';
    onExportPDF: () => void;
    driverMap?: Map<string, Driver>;
    owners?: Owner[];
}

export function SettlementCard({ summary, type, onExportPDF, driverMap, owners }: SettlementCardProps) {
    const isDriver = type === 'driver';
    const title = isDriver ? (summary as SettlementSummary).driverName : (summary as OwnerSettlementSummary).ownerName;
    const subtitle = isDriver ? 'Driver Settlement' : 'Owner/Company Settlement';
    const unitId = (summary as any).unitId;

    // Render Logic for Driver Loads Table
    const renderDriverLoads = () => {
        return (summary as SettlementSummary).loads.map(l => {
            const driver = driverMap?.get(l.driverId);
            const pay = calculateDriverPay(l, driver);
            return (
                <TableRow key={l.id} className="hover:bg-muted/20">
                    <TableCell>{l.loadNumber}</TableCell>
                    <TableCell className="text-xs">{l.pickupLocation}</TableCell>
                    <TableCell className="text-xs">{l.deliveryLocation}</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(pay)}</TableCell>
                </TableRow>
            );
        });
    };

    // Render Logic for Owner Loads Table
    const renderOwnerLoads = () => {
        return (summary as OwnerSettlementSummary).loads.map(l => {
            const owner = owners?.find(o => o.id === (summary as OwnerSettlementSummary).ownerId);
            const pay = owner ? l.invoiceAmount * owner.percentage : 0;
            return (
                <TableRow key={l.id} className="hover:bg-muted/20">
                    <TableCell>{l.loadNumber}</TableCell>
                    <TableCell className="text-xs">{l.pickupLocation}</TableCell>
                    <TableCell className="text-xs">{l.deliveryLocation}</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(pay)}</TableCell>
                </TableRow>
            );
        });
    };

    // Grouped Additions (Logic taken from page.tsx)
    const groupedAdditions = Object.values(summary.additions.reduce((acc, a) => {
        const key = a.expenseCategory || (a.gallons ? 'Fuel' : a.description) || 'Other';
        if (!acc[key]) acc[key] = { description: key, amount: 0 };
        acc[key].amount += a.amount;
        return acc;
    }, {} as Record<string, { description: string; amount: number; }>));


    return (
        <Card className="rounded-xl border-border/50 shadow-sm overflow-hidden">
            <CardHeader className="bg-muted/30 border-b border-border/40 flex flex-row items-center justify-between">
                <div>
                    <CardTitle className="font-display">{title}</CardTitle>
                    <CardDescription>{subtitle} {unitId ? `• Unit ${unitId}` : ''}</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={onExportPDF}>
                    <FileDown className="mr-2 h-4 w-4" /> Export PDF
                </Button>
            </CardHeader>
            <CardContent className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-center mb-8 pb-8 border-b border-border/40">
                    <div className="p-4 bg-muted/20 rounded-xl">
                        <p className="text-sm font-medium text-muted-foreground mb-1">Gross Pay</p>
                        <p className="text-3xl font-bold text-green-600">{formatCurrency(summary.grossPay)}</p>
                    </div>
                    <div className="p-4 bg-muted/20 rounded-xl">
                        <p className="text-sm font-medium text-muted-foreground mb-1">Total Additions</p>
                        <p className="text-3xl font-bold text-green-600">{formatCurrency(summary.totalAdditions)}</p>
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
                        <div className="rounded-lg border overflow-hidden mb-6">
                            <Table>
                                <TableHeader><TableRow className="bg-muted/50"><TableHead>Load #</TableHead><TableHead>Pick Up</TableHead><TableHead>Drop Off</TableHead><TableHead className="text-right">Pay</TableHead></TableRow></TableHeader>
                                <TableBody>
                                    {isDriver ? renderDriverLoads() : renderOwnerLoads()}
                                </TableBody>
                            </Table>
                        </div>

                        {summary.additions.length > 0 && (
                            <>
                                <h4 className="font-semibold mb-4 text-sm uppercase tracking-wider text-muted-foreground">Additions</h4>
                                <div className="rounded-lg border overflow-hidden">
                                    <Table>
                                        <TableHeader><TableRow className="bg-muted/50"><TableHead>Item</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
                                        <TableBody>
                                            {groupedAdditions.map((a, i) => (
                                                <TableRow key={i} className="hover:bg-muted/20"><TableCell>{a.description}</TableCell><TableCell className="text-right">{formatCurrency(a.amount)}</TableCell></TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            </>
                        )}
                    </div>
                    <div>
                        <h4 className="font-semibold mb-4 text-sm uppercase tracking-wider text-muted-foreground">Deductions</h4>
                        <div className="rounded-lg border overflow-hidden">
                            <Table>
                                <TableHeader><TableRow className="bg-muted/50"><TableHead>Item</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
                                <TableBody>
                                    {summary.deductions.map((d, i) => <TableRow key={i} className="hover:bg-muted/20"><TableCell>{d.description}</TableCell><TableCell className="text-right">{formatCurrency(d.amount)}</TableCell></TableRow>)}
                                </TableBody>
                            </Table>
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
