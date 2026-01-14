export type WithId<T> = T & { id: string };

export type Driver = {
  id: string;
  name: string;
  unitId?: string;
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
  percentage: number; // e.g. 0.88 for 88%
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

  // Financials
  linehaul: number;
  fuelSurcharge: number;
  factoringFee: number;
  advance: number;
  miles: number;

  // New Fields
  pickupDate: string;
  brokerId?: string;
  invoiceId: string;
  invoiceDate: string;
  poNumber: string;
  invoiceAmount: number;
  reserveAmount: number;
  primeRateSurcharge: number;
  transactionFee: number;

  proofOfDeliveryUrl?: string;
  rateConfirmationUrl?: string;
};

export type Expense = {
  id: string;
  description: string;
  amount: number;
  type: 'company' | 'driver';
  driverId?: string;
  date: string;
};

export type AccountSettings = {
  factoringCompany: string;
  factoringClearing: string;
  accruedDriverPay: string;
  fuelAdvancesReceivable: string;
  escrowPayable: string;
  factoringFees: string;
  linehaulRevenue: string;
  fuelSurchargeRevenue: string;
  driverPayExpense: string;
};
