import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronRight, FileDown } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { SettlementCard } from '@/components/settlement-card';
import type { OwnerSettlementSummary, Owner } from '@/lib/types';
import { AnimatePresence, motion } from 'framer-motion';

interface GroupedOwnerSettlementProps {
    ownerName: string;
    summaries: OwnerSettlementSummary[];
    onExportPDF: (summary: OwnerSettlementSummary) => void;
    owners: Owner[];
}

export function GroupedOwnerSettlement({ ownerName, summaries, onExportPDF, owners }: GroupedOwnerSettlementProps) {
    const [isExpanded, setIsExpanded] = useState(false);

    // Calculate aggregated totals for the entire group
    const totalGrossPay = summaries.reduce((sum, s) => sum + s.grossPay, 0);
    const totalAdditions = summaries.reduce((sum, s) => sum + s.totalAdditions, 0);
    const totalDeductions = summaries.reduce((sum, s) => sum + s.totalDeductions, 0);
    const totalNetPay = summaries.reduce((sum, s) => sum + s.netPay, 0);

    // If there's only one summary, just render it normally without the extra group wrapper
    if (summaries.length === 1) {
        return (
            <SettlementCard
                key={summaries[0].ownerId}
                summary={summaries[0]}
                type="owner"
                onExportPDF={() => onExportPDF(summaries[0])}
                owners={owners}
            />
        );
    }

    return (
        <div className={`space-y-4 rounded-xl border transition-all duration-300 ${isExpanded ? 'border-primary/40 bg-primary/5 shadow-md' : 'border-border/50 bg-muted/5'}`}>
            {/* Header / Summary Card for Group */}
            <div
                className="flex flex-col md:flex-row items-center justify-between cursor-pointer hover:bg-muted/10 p-4 rounded-lg transition-colors select-none"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="flex items-center gap-4">
                    <div className={`p-2 rounded-full transition-colors ${isExpanded ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'}`}>
                        <motion.div animate={{ rotate: isExpanded ? 90 : 0 }} transition={{ type: "spring", stiffness: 300, damping: 20 }}>
                            <ChevronRight className="h-5 w-5" />
                        </motion.div>
                    </div>
                    <div>
                        <h3 className="text-xl font-bold font-display">{ownerName}</h3>
                        <p className="text-sm font-medium text-muted-foreground">{summaries.length} Units Grouped</p>
                    </div>
                </div>

                <div className="flex items-center gap-6 mt-4 md:mt-0 ml-auto">
                    <div className="flex gap-4 md:gap-8 text-sm">
                        <div className="text-center">
                            <p className="text-muted-foreground mb-1 text-xs uppercase tracking-wider">Gross Pay</p>
                            <p className="font-semibold text-green-600 dark:text-green-400">{formatCurrency(totalGrossPay)}</p>
                        </div>
                        <div className="text-center hidden sm:block">
                            <p className="text-muted-foreground mb-1 text-xs uppercase tracking-wider">Additions</p>
                            <p className="font-semibold text-green-600 dark:text-green-400">{formatCurrency(totalAdditions)}</p>
                        </div>
                        <div className="text-center hidden sm:block">
                            <p className="text-muted-foreground mb-1 text-xs uppercase tracking-wider">Deductions</p>
                            <p className="font-semibold text-red-600 dark:text-red-400">{formatCurrency(totalDeductions)}</p>
                        </div>
                        <div className="text-center bg-background px-3 py-1 rounded-lg border border-border/50 shadow-sm">
                            <p className="text-muted-foreground text-xs uppercase tracking-wider">Net Pay</p>
                            <p className="font-bold text-primary text-base">{formatCurrency(totalNetPay)}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Expanded Area showing individual SettlementCards */}
            <AnimatePresence>
                {isExpanded && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.3, ease: 'easeInOut' }}
                        className="overflow-hidden"
                    >
                        <div className="pt-2 pb-4 px-4 border-t border-primary/20 space-y-6 relative">
                            {/* Decorative grouping line */}
                            <div className="absolute left-6 top-4 bottom-4 w-1 bg-primary/10 rounded-full hidden md:block" />

                            <div className="md:pl-6 space-y-4">
                                {summaries.map((summary, idx) => (
                                    <motion.div
                                        key={summary.ownerId}
                                        initial={{ opacity: 0, x: -20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: idx * 0.1 }}
                                    >
                                        <SettlementCard
                                            summary={summary}
                                            type="owner"
                                            onExportPDF={() => onExportPDF(summary)}
                                            owners={owners}
                                        />
                                    </motion.div>
                                ))}
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
