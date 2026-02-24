export type WithId<T> = T & { id: string };

export type Driver = {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  phoneNumber?: string;
  unitId?: string;
  status?: 'active' | 'inactive';
  terminationDate?: string;
  payType: 'percentage' | 'cpm';
  rate: number;
  recurringDeductions: {
    insurance: number;
    escrow: number;
    eld: number;
    adminFee: number;
    fuel: number;
    tolls: number;
  };
};

export type Owner = {
  id: string;
  name: string; // Company Name
  unitId?: string;
  percentage: number; // e.g. 0.88 for 88%
  fuelRebate: number; // e.g. 0.5 for 50%, 1 for 100%
  recurringDeductions: {
    insurance: number;
    escrow: number;
    eld: number;
    adminFee: number;
    fuel: number;
    tolls: number;
  };
  recurringAdditions: {
    // Add any fixed additions here if needed (e.g. trailer rent credit?)
  };
};

export type Load = {
  id: string;
  loadNumber: string;
  driverId: string;

  // Logistics
  pickupLocation: string;
  deliveryLocation: string;
  pickupDate: string;
  deliveryDate: string;
  truckId: string;
  trailerNumber: string;
  miles: number;
  emptyMiles: number;

  // Financials
  invoiceAmount: number;
  factoringFee: number;
  advance: number;
  reserveAmount: number;
  primeRateSurcharge: number;
  transactionFee: number;

  // Meta
  brokerId?: string;
  invoiceId: string;

  proofOfDeliveryUrl?: string;
  rateConfirmationUrl?: string;
};

export type Expense = {
  id: string;
  description: string;
  amount: number;
  type: 'company' | 'driver' | 'owner';
  driverId?: string;
  ownerId?: string;
  unitId?: string;
  date: string;
  category?: 'addition' | 'deduction';
  expenseCategory?: string; // e.g. Fuel, Insurance, ELD, etc.
  gallons?: number;
  locationState?: string;
  reimbursable?: boolean;
  imageUrl?: string;
  allImageUrls?: string[];
};

export type AccountSettings = {
  factoringCompany: string;
  factoringClearing: string;
  fuelAdvancesReceivable: string;
  escrowPayable: string;
  factoringFees: string;
  linehaulRevenue: string;
  fuelSurchargeRevenue: string;
  driverPayExpense: string;
};

export type ImportError = {
  row: number;
  data: Record<string, any>;
  reason: string;
};

export type ImportResult = {
  success: number;
  errors: ImportError[];
};

export type SettlementSummary = {
  driverId: string;
  driverName: string;
  unitId?: string;
  grossPay: number;
  totalDeductions: number;
  totalAdditions: number;
  netPay: number;
  loads: Load[];
  deductions: (Expense & { isRecurring?: boolean })[];
  additions: (Expense & { isRecurring?: boolean })[];
};

export type OwnerSettlementSummary = {
  ownerId: string;
  ownerName: string;
  unitId?: string;
  grossPay: number;
  totalDeductions: number;
  totalAdditions: number;
  netPay: number;
  loads: Load[];
  deductions: (Expense & { isRecurring?: boolean })[];
  additions: (Expense & { isRecurring?: boolean })[];
};
