import type { AccountSettings } from './types';

export const LS_KEYS = {
  ACCOUNTS: 'tbf-accounts',
};

export const DEFAULT_ACCOUNTS: AccountSettings = {
  factoringCompany: 'Factoring Co.',
  factoringClearing: 'Factoring Clearing',
  fuelAdvancesReceivable: 'Fuel Advances Receivable',
  escrowPayable: 'Escrow Payable',
  factoringFees: 'Factoring Fees',
  linehaulRevenue: 'Linehaul Revenue',
  fuelSurchargeRevenue: 'Fuel Surcharge Revenue',
  driverPayExpense: 'Driver Pay (COGS)',
};
