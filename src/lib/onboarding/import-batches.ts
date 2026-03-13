import {
  collection,
  doc,
  writeBatch,
  getDocs,
  updateDoc,
  deleteDoc,
} from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import type { NormalizedRow } from './types';
import type { Driver, Load } from '@/lib/types';

const BATCH_SIZE = 450;

/** Key by name + truck so one driver record per (person, unit) before merge. */
function driverKey(name: string, unitId: string) {
  return `${(name || '').toLowerCase().trim()}::${(unitId || '').trim()}`;
}
function nameOnlyKey(name: string) {
  return (name || '').toLowerCase().trim();
}

function nameToFirstLast(full: string): { firstName: string; lastName: string } {
  const t = full.trim();
  if (!t) return { firstName: '', lastName: '' };
  const parts = t.split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
  };
}

export type ImportProgress = {
  phase: 'drivers' | 'loads' | 'merging';
  current: number;
  total: number;
  message: string;
  estimatedMsRemaining: number | null;
};

export type ImportResult = {
  driversCreated: number;
  loadsCreated: number;
  errors: string[];
};

/**
 * Create drivers and loads in Firestore in batches. Calls onProgress after each batch.
 * Runs entirely in the caller's context (browser); no server required.
 */
export async function runOnboardingImport(
  firestore: Firestore,
  companyId: string,
  rows: NormalizedRow[],
  onProgress: (p: ImportProgress) => void
): Promise<ImportResult> {
  const errors: string[] = [];
  let driversCreated = 0;
  let loadsCreated = 0;

  const uniqueDrivers = new Map<string, { driverName: string; truckId: string }>();
  for (const r of rows) {
    const key = driverKey(r.driverName, r.truckId ?? '');
    if (!uniqueDrivers.has(key)) {
      uniqueDrivers.set(key, { driverName: r.driverName, truckId: r.truckId ?? '' });
    }
  }

  const driversCollection = collection(firestore, `companies/${companyId}/drivers`);
  const loadsCollection = collection(firestore, `companies/${companyId}/loads`);

  const existingDriversSnap = await getDocs(driversCollection);
  const existingByKey = new Map<string, Driver & { id: string }>();
  existingDriversSnap.forEach((d) => {
    const data = d.data() as Driver;
    const name = `${(data.firstName || '').trim()} ${(data.lastName || '').trim()}`;
    const unit = (data.unitId || '').trim();
    existingByKey.set(driverKey(name, unit), { ...data, id: d.id });
  });

  const driverIdByKey = new Map<string, string>();
  const driversToCreate = Array.from(uniqueDrivers.entries()).filter(([key]) => !existingByKey.has(key));
  const totalDriverBatches = Math.ceil(driversToCreate.length / BATCH_SIZE) || 1;
  let batchStartMs = Date.now();

  for (let i = 0; i < driversToCreate.length; i += BATCH_SIZE) {
    const chunk = driversToCreate.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(firestore);
    for (const [key, { driverName, truckId }] of chunk) {
      const { firstName, lastName } = nameToFirstLast(driverName);
      const docRef = doc(driversCollection);
      batch.set(docRef, {
        firstName: firstName || 'Unknown',
        lastName: lastName || '',
        unitId: truckId || '',
        status: 'active',
        payType: 'percentage',
        rate: 0.25,
        recurringDeductions: {
          insurance: 0,
          escrow: 0,
          eld: 0,
          adminFee: 0,
          fuel: 0,
          tolls: 0,
        },
      });
      driverIdByKey.set(key, docRef.id);
    }
    await batch.commit();
    driversCreated += chunk.length;
    const elapsed = Date.now() - batchStartMs;
    const batchesDone = Math.floor((i + BATCH_SIZE) / BATCH_SIZE);
    const avgMsPerBatch = batchesDone > 0 ? elapsed / batchesDone : 0;
    const remainingBatches = totalDriverBatches - batchesDone;
    onProgress({
      phase: 'drivers',
      current: Math.min(i + BATCH_SIZE, driversToCreate.length),
      total: driversToCreate.length,
      message: `Creating drivers... ${driversCreated} of ${driversToCreate.length} done`,
      estimatedMsRemaining: remainingBatches > 0 ? Math.round(remainingBatches * avgMsPerBatch) : 0,
    });
  }

  for (const [key, driver] of existingByKey) {
    driverIdByKey.set(key, driver.id);
  }

  const totalLoadBatches = Math.ceil(rows.length / BATCH_SIZE) || 1;
  batchStartMs = Date.now();

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(firestore);
    for (const row of chunk) {
      const key = driverKey(row.driverName, row.truckId ?? '');
      const did = driverIdByKey.get(key);
      if (!did) {
        errors.push(`No driver for "${row.driverName}" (Load ${row.loadNumber})`);
        continue;
      }
      const loadRef = doc(loadsCollection);
      const loadData: Omit<Load, 'id'> = {
        loadNumber: row.loadNumber,
        driverId: did,
        pickupLocation: row.pickupLocation ?? '',
        deliveryLocation: row.deliveryLocation ?? '',
        pickupDate: row.pickupDate,
        deliveryDate: row.deliveryDate,
        truckId: row.truckId ?? '',
        trailerNumber: row.trailerNumber ?? '',
        miles: row.miles ?? 0,
        emptyMiles: 0,
        invoiceAmount: row.invoiceAmount ?? 0,
        reserveAmount: 0,
        factoringFee: 0,
        advance: 0,
        primeRateSurcharge: 0,
        transactionFee: 0,
        invoiceId: row.loadNumber,
        brokerName: row.customer ?? undefined,
      };
      if (row.extraStops != null) (loadData as Load).extraStops = row.extraStops;
      batch.set(loadRef, loadData);
      loadsCreated++;
    }
    await batch.commit();
    const elapsed = Date.now() - batchStartMs;
    const batchesDone = Math.floor((i + BATCH_SIZE) / BATCH_SIZE);
    const avgMsPerBatch = batchesDone > 0 ? elapsed / batchesDone : 0;
    const remainingBatches = totalLoadBatches - batchesDone;
    onProgress({
      phase: 'loads',
      current: Math.min(i + BATCH_SIZE, rows.length),
      total: rows.length,
      message: `Importing loads... ${Math.min(i + BATCH_SIZE, rows.length)} of ${rows.length} done`,
      estimatedMsRemaining: remainingBatches > 0 ? Math.round(remainingBatches * avgMsPerBatch) : 0,
    });
  }

  // Merge phase: one driver per name; unitId from latest load, unitHistory = all trucks used
  onProgress({
    phase: 'merging',
    current: 0,
    total: 1,
    message: 'Merging drivers by name and setting current truck from latest load...',
    estimatedMsRemaining: null,
  });
  const nameToDriverIds = new Map<string, string[]>();
  for (const [key, id] of driverIdByKey) {
    const name = key.split('::')[0] ?? '';
    if (!nameToDriverIds.has(name)) nameToDriverIds.set(name, []);
    nameToDriverIds.get(name)!.push(id);
  }
  const loadsSnap = await getDocs(loadsCollection);
  const loadsWithId: (Load & { id: string })[] = loadsSnap.docs.map((d) => ({
    ...(d.data() as Load),
    id: d.id,
  }));
  let merged = 0;
  const names = Array.from(nameToDriverIds.keys());
  for (let n = 0; n < names.length; n++) {
    const name = names[n];
    const driverIds = nameToDriverIds.get(name)!;
    const allLoads = loadsWithId.filter((l) => driverIds.includes(l.driverId));
    if (allLoads.length === 0) continue;
    const sorted = [...allLoads].sort((a, b) => {
      const dA = a.deliveryDate || a.pickupDate || '';
      const dB = b.deliveryDate || b.pickupDate || '';
      return dB.localeCompare(dA);
    });
    const latestLoad = sorted[0];
    const canonicalId = latestLoad.driverId;
    const unitId = latestLoad.truckId || '';
    const unitHistory = [...new Set(allLoads.map((l) => l.truckId).filter(Boolean))];
    if (driverIds.length > 1) {
      const toReassign = allLoads.filter((l) => l.driverId !== canonicalId);
      for (const load of toReassign) {
        await updateDoc(doc(loadsCollection, load.id), { driverId: canonicalId });
      }
      for (const id of driverIds) {
        if (id !== canonicalId) await deleteDoc(doc(driversCollection, id));
      }
      merged += driverIds.length - 1;
    }
    await updateDoc(doc(driversCollection, canonicalId), {
      unitId,
      unitHistory,
    });
    if (n % 10 === 0 && names.length > 10) {
      onProgress({
        phase: 'merging',
        current: n + 1,
        total: names.length,
        message: `Merging drivers... ${n + 1} of ${names.length} names`,
        estimatedMsRemaining: null,
      });
    }
  }

  return { driversCreated, loadsCreated, errors };
}
