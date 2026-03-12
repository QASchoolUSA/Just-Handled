import type { Expense, Load, SettlementSummary } from "@/lib/types";

export type ProfitLossMetrics = {
  revenue: {
    linehaul: number;
    total: number;
  };
  cogs: {
    fuel: number;
    driverWages: number;
    tolls: number;
    dispatchFees: number;
    total: number;
  };
  opex: {
    truckPayments: number;
    insurance: number;
    repairsMaint: number;
    tires: number;
    permits: number;
    dot: number;
    accounting: number;
    office: number;
    eld: number;
    parking: number;
    total: number;
  };
  financial: {
    factoring: number;
    transaction: number;
    total: number;
  };
  grossProfit: number;
  operatingProfit: number;
  netProfit: number;
  kpis: {
    totalMiles: number;
    rpm: number;
    cpm: number;
    profitMargin: number;
  };
};

type Inputs = {
  loads: Load[];
  expenses: Expense[];
  settlementSummary: SettlementSummary[];
};

export function computeProfitLossMetrics({ loads, expenses, settlementSummary }: Inputs): ProfitLossMetrics {
  const linehaulRevenue = loads.reduce((sum, load) => sum + (load.invoiceAmount || 0), 0);
  const totalRevenue = linehaulRevenue;

  const fuelCost = expenses
    .filter((e) => e.expenseCategory === "Fuel" || e.description?.toLowerCase().includes("fuel"))
    .reduce((sum, e) => sum + (e.amount || 0), 0);

  const driverWages = settlementSummary.reduce((sum, s) => sum + (s.grossPay || 0), 0);

  const tolls = expenses
    .filter((e) => e.expenseCategory === "Tolls" || e.description?.toLowerCase().includes("toll"))
    .reduce((sum, e) => sum + (e.amount || 0), 0);

  const dispatchFees = expenses
    .filter((e) => e.description?.toLowerCase().includes("dispatch"))
    .reduce((sum, e) => sum + (e.amount || 0), 0);

  const totalCOGS = fuelCost + driverWages + tolls + dispatchFees;
  const grossProfit = totalRevenue - totalCOGS;

  const sumByCategory = (cat: string) =>
    expenses
      .filter((e) => e.expenseCategory === cat || e.description?.toLowerCase().includes(cat.toLowerCase()))
      .reduce((sum, e) => sum + (e.amount || 0), 0);

  const truckPayments = sumByCategory("Truck Payment") + sumByCategory("Lease");
  const insurance = sumByCategory("Insurance");
  const repairsMaint = sumByCategory("Repairs") + sumByCategory("Maintenance");
  const tires = sumByCategory("Tires");
  const permits = sumByCategory("Permits") + sumByCategory("Licensing");
  const dot = sumByCategory("DOT") + sumByCategory("Compliance");
  const accounting = sumByCategory("Accounting") + sumByCategory("Professional Fees");
  const office = sumByCategory("Office") + sumByCategory("Admin");
  const eld = sumByCategory("ELD") + sumByCategory("GPS") + sumByCategory("Communication");
  const parking = sumByCategory("Parking") + sumByCategory("Storage");

  const totalOpEx = truckPayments + insurance + repairsMaint + tires + permits + dot + accounting + office + eld + parking;

  const factoringFees = loads.reduce((sum, l) => sum + (l.factoringFee || 0), 0);
  const transactionFees = loads.reduce((sum, l) => sum + (l.transactionFee || 0), 0);
  const totalFinancial = factoringFees + transactionFees;

  const operatingProfit = grossProfit - totalOpEx - totalFinancial;
  const netProfit = operatingProfit;

  const totalMiles = loads.reduce((sum, l) => sum + (l.miles || 0), 0);
  const rpm = totalMiles > 0 ? totalRevenue / totalMiles : 0;
  const cpm = totalMiles > 0 ? (totalCOGS + totalOpEx + totalFinancial) / totalMiles : 0;
  const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

  return {
    revenue: {
      linehaul: linehaulRevenue,
      total: totalRevenue,
    },
    cogs: {
      fuel: fuelCost,
      driverWages,
      tolls,
      dispatchFees,
      total: totalCOGS,
    },
    opex: {
      truckPayments,
      insurance,
      repairsMaint,
      tires,
      permits,
      dot,
      accounting,
      office,
      eld,
      parking,
      total: totalOpEx,
    },
    financial: {
      factoring: factoringFees,
      transaction: transactionFees,
      total: totalFinancial,
    },
    grossProfit,
    operatingProfit,
    netProfit,
    kpis: {
      totalMiles,
      rpm,
      cpm,
      profitMargin,
    },
  };
}

