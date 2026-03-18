export type BalanceSheetSnapshot = {
  // --- Assets ---
  cash: number;
  arUnfactored: number;
  factoredReceivables: number;
  factoredReserve: number;
  fuelAdvances: number;
  prepaid: number;
  trucks: number;
  trailers: number;
  otherEquipment: number;
  /**
   * Accumulated depreciation (positive number representing the "less accumulated depreciation" line).
   * Net PPE = (trucks + trailers + otherEquipment) - accumDep
   */
  accumDep: number;
  securityDeposits: number;
  iftaCredits: number;

  // --- Liabilities ---
  ap: number;
  creditCards: number;
  accrued: number;
  payrollTaxes: number;
  fuelCards: number;
  factoringAdvance: number;
  truckLoans: number;
  otherLTDebt: number;

  // --- Equity ---
  ownersCapital: number;
  retainedEarnings: number;
};

/**
 * Convenient defaults so the UI can always render numeric inputs.
 * We treat missing snapshot docs as "all zeros" in the editor, while the page still displays "—"
 * when no snapshot exists.
 */
export const EMPTY_BALANCE_SHEET_SNAPSHOT: BalanceSheetSnapshot = {
  // Assets
  cash: 0,
  arUnfactored: 0,
  factoredReceivables: 0,
  factoredReserve: 0,
  fuelAdvances: 0,
  prepaid: 0,
  trucks: 0,
  trailers: 0,
  otherEquipment: 0,
  accumDep: 0,
  securityDeposits: 0,
  iftaCredits: 0,

  // Liabilities
  ap: 0,
  creditCards: 0,
  accrued: 0,
  payrollTaxes: 0,
  fuelCards: 0,
  factoringAdvance: 0,
  truckLoans: 0,
  otherLTDebt: 0,

  // Equity
  ownersCapital: 0,
  retainedEarnings: 0,
};

export type BalanceSheetComputed = {
  // Assets totals
  totalCurrentAssets: number;
  ppeCost: number;
  netPpe: number;
  totalOtherAssets: number;
  totalAssets: number;

  // Liabilities totals
  totalCurrentLiab: number;
  totalLongTermLiab: number;
  totalLiabilities: number;

  // Equity totals
  ownersCapital: number;
  retainedEarnings: number;
  currentPeriodNetIncome: number;
  totalEquity: number;

  // Rules / equation
  totalLiabEquity: number;
  assetsMinusLiabPlusEquity: number;

  // Calculators requested by the user
  netWorth: number;
  debtToEquity: number | null;
  workingCapital: number;
  currentRatio: number | null;
};

