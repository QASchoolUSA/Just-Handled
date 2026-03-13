export type WithId<T> = T & { id: string };

export type Company = {
  id?: string;
  name: string;
  createdAt?: any; // Firestore Timestamp
  subscription?: {
    status: 'trialing' | 'active' | 'past_due' | 'canceled';
    plan: 'trial' | 'pro';
    trialEndsAt?: number; // timestamp in MS
  };
  /** Set when user completes the initial data import onboarding. */
  onboardingCompleted?: boolean;
  /** Set when user skips onboarding (timestamp in ms). */
  onboardingSkippedAt?: number;
};

export type UserProfile = {
  id?: string;
  email: string;
  displayName?: string;
  companyId: string;
  role?: string;
  createdAt?: any;
};

export type Driver = {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  phoneNumber?: string;
  unitId?: string;
  /** Trucks/units this driver has used (from load history). Current unitId is from latest load. */
  unitHistory?: string[];
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
  driverName?: string; // Denormalized name

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
  /** Number of additional stops (beyond origin/destination). */
  extraStops?: number;
  /** Pay for extra stops (amount paid to driver for additional stops). */
  extraStopsPay?: number;

  // Meta
  brokerId?: string;
  /** Broker/shipper display name (optional). */
  brokerName?: string;
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
  driverName?: string; // Denormalized name
  ownerName?: string; // Denormalized name
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
  successCount: number;
  errors: ImportError[];
  skippedCount?: number;
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
