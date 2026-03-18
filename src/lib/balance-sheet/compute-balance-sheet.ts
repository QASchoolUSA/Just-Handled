import type { BalanceSheetComputed, BalanceSheetSnapshot } from "./balance-sheet-types";

function safeDiv(n: number, d: number): number | null {
  if (!Number.isFinite(n) || !Number.isFinite(d) || d === 0) return null;
  return n / d;
}

export function computeBalanceSheet(
  snapshot: BalanceSheetSnapshot,
  currentPeriodNetIncome: number
): BalanceSheetComputed {
  // --- Assets ---
  const totalCurrentAssets =
    snapshot.cash +
    snapshot.arUnfactored +
    snapshot.factoredReceivables +
    snapshot.factoredReserve +
    snapshot.fuelAdvances +
    snapshot.prepaid;

  const ppeCost = snapshot.trucks + snapshot.trailers + snapshot.otherEquipment;
  const netPpe = ppeCost - snapshot.accumDep;

  const totalOtherAssets = snapshot.securityDeposits + snapshot.iftaCredits;

  const totalAssets = totalCurrentAssets + netPpe + totalOtherAssets;

  // --- Liabilities ---
  const totalCurrentLiab =
    snapshot.ap +
    snapshot.creditCards +
    snapshot.accrued +
    snapshot.payrollTaxes +
    snapshot.fuelCards +
    snapshot.factoringAdvance;

  const totalLongTermLiab = snapshot.truckLoans + snapshot.otherLTDebt;
  const totalLiabilities = totalCurrentLiab + totalLongTermLiab;

  // --- Equity ---
  const ownersCapital = snapshot.ownersCapital;
  const retainedEarnings = snapshot.retainedEarnings;
  const totalEquity = ownersCapital + retainedEarnings + currentPeriodNetIncome;

  // --- Equation / totals ---
  const totalLiabEquity = totalLiabilities + totalEquity;
  const assetsMinusLiabPlusEquity = totalAssets - totalLiabEquity;

  // --- Requested calculators ---
  const netWorth = totalAssets - totalLiabilities;
  const debtToEquity = safeDiv(totalLiabilities, totalEquity);
  const workingCapital = totalCurrentAssets - totalCurrentLiab;
  const currentRatio = safeDiv(totalCurrentAssets, totalCurrentLiab);

  return {
    totalCurrentAssets,
    ppeCost,
    netPpe,
    totalOtherAssets,
    totalAssets,

    totalCurrentLiab,
    totalLongTermLiab,
    totalLiabilities,

    ownersCapital,
    retainedEarnings,
    currentPeriodNetIncome,
    totalEquity,

    totalLiabEquity,
    assetsMinusLiabPlusEquity,

    netWorth,
    debtToEquity,
    workingCapital,
    currentRatio,
  };
}

/**
 * Returns the retained earnings value needed so that:
 *   Total Assets = Total Liabilities + (Owners Capital + Retained Earnings + Current Period Net Income)
 *
 * We adjust only retained earnings so the equation holds exactly.
 */
export function computeBalancedRetainedEarnings(params: {
  snapshot: BalanceSheetSnapshot;
  currentPeriodNetIncome: number;
  // Optionally pass precomputed totals to avoid recompute when doing UI interactions.
}): number {
  const { snapshot, currentPeriodNetIncome } = params;

  // Temporarily compute totals using the draft snapshot's existing retainedEarnings,
  // but the "balanced" retainedEarnings calculation below derives directly from the equation.
  const { totalAssets, totalLiabilities, ownersCapital } = computeBalanceSheet(
    snapshot,
    currentPeriodNetIncome
  );

  const balanced = totalAssets - totalLiabilities - ownersCapital - currentPeriodNetIncome;
  return balanced;
}

