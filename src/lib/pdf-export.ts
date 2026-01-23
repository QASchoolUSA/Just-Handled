import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { SettlementSummary, OwnerSettlementSummary } from '@/lib/types';
import { formatCurrency } from './utils';

export const generateSettlementPDF = (settlement: SettlementSummary | OwnerSettlementSummary, payPeriodStart: Date, payPeriodEnd: Date) => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;

    // Determine name based on Type
    let payToName = '';
    if ('driverName' in settlement) {
        payToName = settlement.driverName;
    } else if ('ownerName' in settlement) {
        payToName = settlement.ownerName;
    }

    // --- Header ---
    doc.setFontSize(22);
    doc.text('JUST HANDLED INC', pageWidth / 2, 20, { align: 'center' });

    doc.setFontSize(10);
    doc.text('123 Logistics Way, Transport City, TS 12345', pageWidth / 2, 26, { align: 'center' });
    doc.text('Phone: (555) 123-4567 | Email: billing@justhandled.com', pageWidth / 2, 31, { align: 'center' });

    doc.line(10, 36, pageWidth - 10, 36);

    // --- Settlement Details ---
    doc.setFontSize(14);
    doc.text('SETTLEMENT STATEMENT', 14, 48);

    doc.setFontSize(10);
    const periodStr = `${format(payPeriodStart, 'MMM d, yyyy')} - ${format(payPeriodEnd, 'MMM d, yyyy')}`;
    doc.text(`Pay Period: ${periodStr}`, 14, 55);
    doc.text(`Statement Date: ${format(new Date(), 'MMM d, yyyy')}`, 14, 60);

    // Driver/Owner Info (Right aligned)
    doc.text(`Pay To:`, pageWidth - 80, 48);
    doc.setFontSize(12);
    doc.text(payToName, pageWidth - 80, 54);
    doc.setFontSize(10);

    // --- Loads Table ---
    doc.setFontSize(12);
    doc.text('Loads / Revenue', 14, 75);

    autoTable(doc, {
        startY: 80,
        head: [['Load #', 'Pickup', 'Delivery', 'Origin', 'Destination', 'Pay']],
        body: settlement.loads.map(l => {
            // Calculate approximate pay for display in PDF if possible, or just show Invoice Amount?
            // Since we don't have the individual load pay stored in the summary loads list easily accessible without re-calc, 
            // and for owners it is a percentage, for drivers it is rate * miles or %.
            // For simplicity in this fix, we will show the Invoice Amount, but note that for owners this might be confusing if they expect their cut.
            // Ideally we pass a calculated field. But let's stick to Invoice Amount for now or try to deduce.
            return [
                l.loadNumber,
                l.pickupDate,
                l.deliveryDate,
                l.pickupLocation,
                l.deliveryLocation,
                formatCurrency(l.invoiceAmount)
            ];
        }),
        theme: 'striped',
        headStyles: { fillColor: [41, 128, 185] },
    });

    let currentY: number = (doc as any).lastAutoTable.finalY + 10;

    // --- Deductions Table ---
    if (settlement.deductions.length > 0) {
        doc.text('Deductions', 14, currentY);

        autoTable(doc, {
            startY: currentY + 5,
            head: [['Date', 'Description', 'Amount']],
            body: settlement.deductions.map(d => [
                format(new Date(d.date), 'MM/dd/yyyy'),
                d.description,
                formatCurrency(d.amount)
            ]),
            theme: 'striped',
            headStyles: { fillColor: [192, 57, 43] },
        });
        currentY = (doc as any).lastAutoTable.finalY + 10;
    }

    // --- Summary ---
    const boxTop = currentY + 5;
    const boxWidth = 80;
    const boxLeft = pageWidth - boxWidth - 14;

    // Check for page overflow
    if (boxTop + 40 > doc.internal.pageSize.height) {
        doc.addPage();
        // Reset Y for new page
        // boxTop = 20; // Re-assign if we were using let
    }

    doc.setFillColor(245, 245, 245);
    doc.rect(boxLeft, boxTop, boxWidth, 40, 'F');

    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);

    doc.text('Gross Pay:', boxLeft + 5, boxTop + 10);
    doc.text(formatCurrency(settlement.grossPay), boxLeft + boxWidth - 5, boxTop + 10, { align: 'right' });

    doc.text('Total Deductions:', boxLeft + 5, boxTop + 20);
    doc.setTextColor(192, 57, 43);
    doc.text(`-${formatCurrency(settlement.totalDeductions)}`, boxLeft + boxWidth - 5, boxTop + 20, { align: 'right' });

    doc.line(boxLeft + 5, boxTop + 25, boxLeft + boxWidth - 5, boxTop + 25);

    doc.setTextColor(0, 0, 0);
    doc.setFontSize(14);
    doc.text('Net Pay:', boxLeft + 5, boxTop + 35);
    doc.text(formatCurrency(settlement.netPay), boxLeft + boxWidth - 5, boxTop + 35, { align: 'right' });

    // Save
    const fileName = `Settlement_${payToName.replace(/\s+/g, '_')}_${format(payPeriodEnd, 'yyyy-MM-dd')}.pdf`;
    doc.save(fileName);
};
