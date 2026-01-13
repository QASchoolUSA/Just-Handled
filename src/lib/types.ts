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
  };
};

export type Load = {
  id: string;
  loadNumber: string;
  driverId: string;
  linehaul: number;
  fuelSurcharge: number;
  factoringFee: number;
  advance: number;
  miles: number;
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
