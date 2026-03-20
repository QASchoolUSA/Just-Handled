import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import type { ProfitLossMetrics } from "@/lib/financial/compute-profit-loss";
import type { BalanceSheetComputed } from "@/lib/balance-sheet/balance-sheet-types";

function fmtMoney(v: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v);
}

function cleanFilePart(v: string) {
  return (v || "Statement").replace(/[^a-zA-Z0-9 _-]/g, "").trim().replace(/\s+/g, "_");
}

function drawReportHeader(doc: jsPDF, params: { title: string; company: string; period: string }) {
  const { title, company, period } = params;
  const pageWidth = doc.internal.pageSize.width;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(14);
  doc.text(title, pageWidth / 2, 14, { align: "center" });
  doc.setFontSize(12);
  doc.text(company, pageWidth / 2, 20, { align: "center" });
  doc.setFontSize(10);
  doc.text(period, pageWidth / 2, 26, { align: "center" });
  doc.setFontSize(8);
  doc.text(`Accrual Basis ${format(new Date(), "EEEE, MMMM d, yyyy hh:mm a")}`, pageWidth / 2, 31, { align: "center" });
}

function drawPageFooters(doc: jsPDF) {
  const total = doc.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.text(`-- ${i} of ${total} --`, pageWidth / 2, pageHeight - 8, { align: "center" });
  }
}

export function exportProfitLossPdf(params: { companyName?: string | null; from: Date; to: Date; metrics: ProfitLossMetrics }) {
  const { companyName, from, to, metrics } = params;
  const doc = new jsPDF();
  const company = companyName || "Company";
  const period = `${format(from, "MMMM")}-${format(to, "MMMM")}, ${format(to, "yyyy")}`;

  type RowKind = "section" | "item" | "total" | "emphasis";
  type Row = { label: string; value?: number; kind: RowKind; indent?: 0 | 1 | 2 };
  const rows: Row[] = [
    { label: "Income", kind: "section" },
    { label: "Service Income", value: metrics.revenue.total, kind: "item", indent: 1 },
    { label: "Total for Income", value: metrics.revenue.total, kind: "total" },
    { label: "Cost of Goods Sold", kind: "section" },
    { label: "Contractors Drivers and Owners", value: metrics.cogs.driverWages, kind: "item", indent: 1 },
    { label: "Dispatch services", value: metrics.cogs.dispatchFees, kind: "item", indent: 1 },
    { label: "Fuel", value: metrics.cogs.fuel, kind: "item", indent: 1 },
    { label: "Toll Roads and Parking Expenses", value: metrics.cogs.tolls, kind: "item", indent: 1 },
    { label: "Total for Cost of Goods Sold", value: metrics.cogs.total, kind: "total" },
    { label: "Gross Profit", value: metrics.grossProfit, kind: "emphasis" },
    { label: "Expenses", kind: "section" },
    { label: "Truck Payments / Lease", value: metrics.opex.truckPayments, kind: "item", indent: 1 },
    { label: "Insurance", value: metrics.opex.insurance, kind: "item", indent: 1 },
    { label: "Repairs & Maintenance", value: metrics.opex.repairsMaint, kind: "item", indent: 1 },
    { label: "Tires", value: metrics.opex.tires, kind: "item", indent: 1 },
    { label: "License & Permits", value: metrics.opex.permits, kind: "item", indent: 1 },
    { label: "Accounting and safety", value: metrics.opex.accounting, kind: "item", indent: 1 },
    { label: "Software & Apps Expense", value: metrics.opex.eld, kind: "item", indent: 1 },
    { label: "Office & Admin", value: metrics.opex.office, kind: "item", indent: 1 },
    { label: "Total for Expenses", value: metrics.opex.total, kind: "total" },
    { label: "Other Expenses", kind: "section" },
    { label: "Factoring fees", value: metrics.financial.factoring, kind: "item", indent: 1 },
    { label: "Transaction fee", value: metrics.financial.transaction, kind: "item", indent: 1 },
    { label: "Total for Other Expenses", value: metrics.financial.total, kind: "total" },
    { label: "Net Income", value: metrics.netProfit, kind: "emphasis" },
  ];

  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;
  const left = 14;
  const right = pageWidth - 14;
  const amountX = right - 1;

  const drawHeader = () => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(16);
    doc.text("Profit and Loss", pageWidth / 2, 16, { align: "center" });
    doc.setFontSize(14);
    doc.text(company, pageWidth / 2, 24, { align: "center" });
    doc.setFontSize(12);
    doc.text(period, pageWidth / 2, 31, { align: "center" });

    doc.setLineWidth(0.3);
    doc.line(left, 40, right, 40);
    doc.setFontSize(11);
    doc.text("DISTRIBUTION ACCOUNT", left + 1, 45);
    doc.text("TOTAL", amountX, 45, { align: "right" });
    doc.line(left, 48, right, 48);
  };

  let y = 52;
  let page = 1;
  drawHeader();

  const newPage = () => {
    doc.addPage();
    page++;
    drawHeader();
    y = 52;
  };

  for (const row of rows) {
    if (y > pageHeight - 18) newPage();
    const indent = row.indent === 2 ? 10 : row.indent === 1 ? 6 : 0;

    if (row.kind === "section") {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(12);
      doc.text(row.label, left + 1, y);
      y += 5.5;
      continue;
    }

    if (row.kind === "total") {
      doc.setLineWidth(0.1);
      doc.line(left, y - 3.4, right, y - 3.4);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text(row.label, left + 1 + indent, y);
      doc.text(fmtMoney(row.value ?? 0), amountX, y, { align: "right" });
      y += 6.2;
      continue;
    }

    if (row.kind === "emphasis") {
      doc.setLineWidth(0.5);
      doc.line(left, y - 3.6, right, y - 3.6);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12.5);
      doc.text(row.label, left + 1 + indent, y);
      doc.text(fmtMoney(row.value ?? 0), amountX, y, { align: "right" });
      doc.line(left, y + 2.3, right, y + 2.3);
      y += 8;
      continue;
    }

    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    doc.text(row.label, left + 1 + indent, y);
    if (typeof row.value === "number") {
      doc.text(fmtMoney(row.value), amountX, y, { align: "right" });
    }
    y += 5.4;
  }

  const totalPages = doc.getNumberOfPages();
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.text(`-- ${i} of ${totalPages} --`, pageWidth / 2, pageHeight - 8, { align: "center" });
  }
  doc.save(`Profit_and_Loss_${cleanFilePart(company)}_${format(from, "yyyy-MM-dd")}_to_${format(to, "yyyy-MM-dd")}.pdf`);
}

export function exportBalanceSheetPdf(params: { companyName?: string | null; asOf: Date; computed: BalanceSheetComputed }) {
  const { companyName, asOf, computed } = params;
  const doc = new jsPDF();
  const company = companyName || "Company";

  drawReportHeader(doc, {
    title: "Balance Sheet",
    company,
    period: `As of ${format(asOf, "MMMM d, yyyy")}`,
  });

  autoTable(doc, {
    startY: 36,
    head: [["DISTRIBUTION", "ACCOUNT", "TOTAL"]],
    body: [
      ["", "Assets", ""],
      ["", "Current Assets", ""],
      ["", "Total for Current Assets", fmtMoney(computed.totalCurrentAssets)],
      ["", "Fixed Assets", ""],
      ["", "Net Property & Equipment", fmtMoney(computed.netPpe)],
      ["", "Other Assets", fmtMoney(computed.totalOtherAssets)],
      ["", "Total for Assets", fmtMoney(computed.totalAssets)],
      ["", "Liabilities and Equity", ""],
      ["", "Liabilities", ""],
      ["", "Current Liabilities", ""],
      ["", "Total for Current Liabilities", fmtMoney(computed.totalCurrentLiab)],
      ["", "Long-term Liabilities", fmtMoney(computed.totalLongTermLiab)],
      ["", "Total for Liabilities", fmtMoney(computed.totalLiabilities)],
      ["", "Equity", ""],
      ["", "Owner's Investment", fmtMoney(computed.ownersCapital)],
      ["", "Retained Earnings", fmtMoney(computed.retainedEarnings)],
      ["", "Net Income", fmtMoney(computed.currentPeriodNetIncome)],
      ["", "Total for Equity", fmtMoney(computed.totalEquity)],
      ["", "Total for Liabilities and Equity", fmtMoney(computed.totalLiabEquity)],
    ],
    theme: "plain",
    styles: { fontSize: 9, cellPadding: 1.5, textColor: [0, 0, 0], lineWidth: 0 },
    headStyles: { fontStyle: "bold", fillColor: false, textColor: [0, 0, 0], halign: "left" },
    columnStyles: { 0: { cellWidth: 34 }, 1: { cellWidth: 120 }, 2: { halign: "right" } },
    didParseCell: (data) => {
      const row = data.row.raw as string[];
      const account = String(row?.[1] ?? "");
      if (
        account === "Assets" ||
        account === "Current Assets" ||
        account === "Fixed Assets" ||
        account === "Liabilities and Equity" ||
        account === "Liabilities" ||
        account === "Current Liabilities" ||
        account === "Long-term Liabilities" ||
        account === "Equity" ||
        account.startsWith("Total for ")
      ) {
        data.cell.styles.fontStyle = "bold";
      }
      if (data.column.index === 1 && !account.startsWith("Total for ") && !["Assets", "Current Assets", "Fixed Assets", "Liabilities and Equity", "Liabilities", "Current Liabilities", "Long-term Liabilities", "Equity"].includes(account)) {
        data.cell.styles.cellPadding = { top: 1.5, right: 1.5, bottom: 1.5, left: 6 };
      }
    },
    didDrawPage: () => {
      drawReportHeader(doc, {
        title: "Balance Sheet",
        company,
        period: `As of ${format(asOf, "MMMM d, yyyy")}`,
      });
    },
    margin: { top: 36, right: 14, bottom: 14, left: 14 },
  });

  drawPageFooters(doc);
  doc.save(`Balance_Sheet_${cleanFilePart(company)}_${format(asOf, "yyyy-MM-dd")}.pdf`);
}
