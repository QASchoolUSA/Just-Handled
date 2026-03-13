/** System fields the user maps their file columns to. */
export const ONBOARDING_SYSTEM_FIELDS = [
  'loadNumber',
  'customer',
  'driver',
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
] as const;

export type OnboardingSystemField = (typeof ONBOARDING_SYSTEM_FIELDS)[number];

export const SYSTEM_FIELD_LABELS: Record<OnboardingSystemField, string> = {
  loadNumber: 'Load #',
  customer: 'Customer',
  driver: 'Driver',
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
};
