/** System fields the user maps their file columns to. */
export const ONBOARDING_SYSTEM_FIELDS = [
  'loadNumber',
  'customer',
  'driver',
  'driverEmail',
  'driverPhone',
  'truckId',
  'trailerNumber',
  'pickupLocation',
  'deliveryLocation',
  'pickupDate',
  'deliveryDate',
  'extraStops',
  'invoiceAmount',
  'totalPay',
  'miles',
  'driverPayType',
  'driverRate',
  'driverTariff',
] as const;

export type OnboardingSystemField = (typeof ONBOARDING_SYSTEM_FIELDS)[number];

export const SYSTEM_FIELD_LABELS: Record<OnboardingSystemField, string> = {
  loadNumber: 'Load #',
  customer: 'Customer',
  driver: 'Driver',
  driverEmail: 'Driver Email',
  driverPhone: 'Driver Phone',
  truckId: 'Truck / Unit ID',
  trailerNumber: 'Trailer ID',
  pickupLocation: 'Pickup Location',
  deliveryLocation: 'Delivery Location',
  pickupDate: 'Pickup Date',
  deliveryDate: 'Delivery Date',
  extraStops: 'Stops Count',
  invoiceAmount: 'Load Pay / Gross Pay',
  totalPay: 'Total Pay',
  miles: 'Total Miles',
  driverPayType: 'Driver Pay Type (percentage/cpm)',
  driverRate: 'Driver Rate',
  driverTariff: 'Driver Tariff (e.g. .60 cpm or 30% from gross)',
};

/** Required system fields for import to proceed. */
export const REQUIRED_SYSTEM_FIELDS: OnboardingSystemField[] = [
  'loadNumber',
  'driver',
  'pickupDate',
  'deliveryDate',
];

/** Column mapping: system field -> file column header (as in parsed row keys). */
export type ColumnMapping = Partial<Record<OnboardingSystemField, string>>;

export type ParsedFile = {
  headers: string[];
  rows: Record<string, unknown>[];
  fileName: string;
};

export type NormalizedRow = {
  loadNumber: string;
  customer?: string;
  driverName: string;
  driverEmail?: string;
  driverPhone?: string;
  truckId?: string;
  trailerNumber?: string;
  pickupLocation?: string;
  deliveryLocation?: string;
  pickupDate: string;
  deliveryDate: string;
  extraStops?: number;
  invoiceAmount?: number;
  totalPay?: number;
  miles?: number;
  /** Driver pay type from file (optional; used when re-importing or file has pay columns). */
  payType?: 'percentage' | 'cpm';
  /** Driver rate from file (optional). */
  rate?: number;
};
