import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { SettlementSummary, OwnerSettlementSummary } from '@/lib/types';
import { formatCurrency } from './utils';

export const generateSettlementPDF = (settlement: SettlementSummary | OwnerSettlementSummary, payPeriodStart: Date, payPeriodEnd: Date) => {
    const { doc, fileName } = createSettlementDoc(settlement, payPeriodStart, payPeriodEnd);
    doc.save(fileName);
};


// Helper: Get Raw PDF Doc (Decoupled from Save)
const createSettlementDoc = (settlement: SettlementSummary | OwnerSettlementSummary, payPeriodStart: Date, payPeriodEnd: Date) => {
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

        // Group Deductions
        const groupedDeductions = Object.values(settlement.deductions.reduce((acc, d) => {
            // Use expenseCategory if available, otherwise check gallons for Fuel, otherwise description
            const key = d.expenseCategory || (d.gallons ? 'Fuel' : d.description) || 'Other';
            if (!acc[key]) acc[key] = { description: key, amount: 0, date: d.date }; // Keep one date or use latest? UI doesn't show date for grouped.
            acc[key].amount += d.amount;
            return acc;
        }, {} as Record<string, { description: string; amount: number; date: string }>));

        autoTable(doc, {
            startY: currentY + 5,
            head: [['Description', 'Amount']], // Removed Date column as it's aggregated
            body: groupedDeductions.map(d => [
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

    // Generate File Name
    const unitId = settlement.unitId || 'UnknownUnit';
    const cleanName = payToName.replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, '_');
    const startStr = format(payPeriodStart, 'yyyy-MM-dd');
    const endStr = format(payPeriodEnd, 'yyyy-MM-dd');

    const typePrefix = 'driverName' in settlement ? 'Driver' : 'Owner';

    // Format: Type - Unit ID - Name - Dates
    // Example: Driver - 1001 - John_Doe - 2025-04-14_to_2025-04-20
    const fileName = `${typePrefix} - ${unitId} - ${cleanName} - ${startStr}_to_${endStr}.pdf`;

    // --- Footer (Watermark) ---
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(10);
        doc.setTextColor(150, 150, 150); // Gray color
        doc.text('Just Handled', pageWidth / 2, doc.internal.pageSize.height - 10, { align: 'center' });
    }

    return { doc, fileName };
};


export const generateBatchZip = async (
    settlements: (SettlementSummary | OwnerSettlementSummary)[],
    payPeriodStart: Date,
    payPeriodEnd: Date
) => {
    try {
        // Dynamic import for performance (lazy load library)
        const JSZip = (await import('jszip')).default;
        const zip = new JSZip();

        let count = 0;

        settlements.forEach(settlement => {
            const { doc, fileName } = createSettlementDoc(settlement, payPeriodStart, payPeriodEnd);
            const pdfBlob = doc.output('blob');
            zip.file(fileName, pdfBlob);
            count++;
        });

        if (count === 0) {
            alert("No settlements to download.");
            return;
        }

        // Generate Zip Blob
        const content = await zip.generateAsync({ type: 'blob' });

        // Trigger Download
        const zipName = `Settlements_Batch_${format(payPeriodEnd, 'yyyy-MM-dd')}.zip`;
        const link = document.createElement('a');
        link.href = URL.createObjectURL(content);
        link.download = zipName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

    } catch (e) {
        console.error("Batch download failed:", e);
        alert("Failed to generate batch archive.");
    }
};
