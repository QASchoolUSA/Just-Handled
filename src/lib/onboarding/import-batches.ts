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
  /** Unique drivers after merge (one per person). Use this for display. */
  uniqueDrivers: number;
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

  const uniqueDrivers = new Map<string, {
    driverName: string;
    truckId: string;
    driverEmail?: string;
    driverPhone?: string;
    payType?: 'percentage' | 'cpm';
    rate?: number;
  }>();
  for (const r of rows) {
    const key = driverKey(r.driverName, r.truckId ?? '');
    if (!uniqueDrivers.has(key)) {
      uniqueDrivers.set(key, {
        driverName: r.driverName,
        truckId: r.truckId ?? '',
        ...(r.driverEmail ? { driverEmail: r.driverEmail } : {}),
        ...(r.driverPhone ? { driverPhone: r.driverPhone } : {}),
        ...(r.payType != null && r.rate != null ? { payType: r.payType, rate: r.rate } : {}),
      });
    } else {
      const cur = uniqueDrivers.get(key)!;
      if (!cur.driverEmail && r.driverEmail) cur.driverEmail = r.driverEmail;
      if (!cur.driverPhone && r.driverPhone) cur.driverPhone = r.driverPhone;
      if ((cur.payType == null || cur.rate == null) && r.payType != null && r.rate != null) {
        cur.payType = r.payType;
        cur.rate = r.rate;
      }
    }
  }

  const driversCollection = collection(firestore, `companies/${companyId}/drivers`);
  const loadsCollection = collection(firestore, `companies/${companyId}/loads`);

  // Keep a "best available" pay setup per name so merge does not drop payType/rate
  // when canonical driver id is picked from latest load.
  const payByName = new Map<string, { payType: 'percentage' | 'cpm'; rate: number }>();
  for (const [, v] of uniqueDrivers) {
    if (v.payType != null && v.rate != null) {
      payByName.set(nameOnlyKey(v.driverName), { payType: v.payType, rate: v.rate });
    }
  }

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
    for (const [key, { driverName, truckId, driverEmail, driverPhone, payType, rate }] of chunk) {
      const { firstName, lastName } = nameToFirstLast(driverName);
      const docRef = doc(driversCollection);
      const base: Record<string, unknown> = {
        firstName: firstName || 'Unknown',
        lastName: lastName || '',
        unitId: truckId || '',
        ...(driverEmail ? { email: String(driverEmail).trim() } : {}),
        ...(driverPhone ? { phoneNumber: String(driverPhone).trim() } : {}),
        status: 'active',
        recurringDeductions: {
          insurance: 0,
          escrow: 0,
          eld: 0,
          adminFee: 0,
          fuel: 0,
          tolls: 0,
        },
      };
      if (payType != null && rate != null) {
        base.payType = payType;
        base.rate = rate;
      }
      batch.set(docRef, base);
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

  // Update existing drivers with pay data when re-importing with driver pay columns (no new driver docs created)
  const driverPayUpdates = Array.from(uniqueDrivers.entries()).filter(
    ([key]) => existingByKey.has(key)
  );
  for (const [key, { payType, rate, driverEmail, driverPhone }] of driverPayUpdates) {
    if (payType == null && rate == null && !driverEmail && !driverPhone) continue;
    const driverId = driverIdByKey.get(key);
    if (!driverId) continue;
    await updateDoc(doc(driversCollection, driverId), {
      ...(payType != null && rate != null ? { payType, rate } : {}),
      ...(driverEmail ? { email: String(driverEmail).trim() } : {}),
      ...(driverPhone ? { phoneNumber: String(driverPhone).trim() } : {}),
    });
  }

  /** Within this import, consider duplicate only if load number AND customer/broker match (same load # with different broker = separate loads). */
  function loadDedupKey(row: NormalizedRow): string {
    const broker = (row.customer ?? '').trim().toLowerCase();
    return `${(row.loadNumber ?? '').trim()}::${broker}`;
  }
  const seenLoadKeys = new Set<string>();

  // Also dedupe against already existing loads in this company to avoid inflating revenue
  // when onboarding/import is accidentally run multiple times with the same file.
  const existingLoadsSnap = await getDocs(loadsCollection);
  const existingLoadKeys = new Set<string>();
  existingLoadsSnap.forEach((d) => {
    const l = d.data() as Partial<Load>;
    const loadNumber = (l.loadNumber ?? '').trim();
    if (!loadNumber) return;
    const broker = (l.brokerName ?? '').trim().toLowerCase();
    existingLoadKeys.add(`${loadNumber}::${broker}`);
  });

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
      const dedupKey = loadDedupKey(row);
      if (seenLoadKeys.has(dedupKey)) continue; // skip only when same load # and same broker in this file
      if (existingLoadKeys.has(dedupKey)) continue; // skip if already imported previously
      seenLoadKeys.add(dedupKey);

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
      existingLoadKeys.add(dedupKey);
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
  const mergeStartMs = Date.now();
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
  const latestDriversSnap = await getDocs(driversCollection);
  const driverDocById = new Map<string, (Driver & { id: string })>();
  latestDriversSnap.forEach((d) => {
    driverDocById.set(d.id, { ...(d.data() as Driver), id: d.id });
  });

  const pickNonEmpty = (values: Array<unknown>): string | undefined => {
    for (const v of values) {
      const s = String(v ?? '').trim();
      if (s) return s;
    }
    return undefined;
  };
  const names = Array.from(nameToDriverIds.keys());
  for (let n = 0; n < names.length; n++) {
    const name = names[n];
    const driverIds = nameToDriverIds.get(name)!;
    const allLoads = loadsWithId.filter((l) => driverIds.includes(l.driverId));
    if (allLoads.length === 0) {
      onProgress({
        phase: 'merging',
        current: n + 1,
        total: names.length,
        message: `Merging drivers... ${n + 1} of ${names.length} names`,
        estimatedMsRemaining: n > 0 ? Math.round(((Date.now() - mergeStartMs) / (n + 1)) * (names.length - n - 1)) : null,
      });
      continue;
    }
    const sorted = [...allLoads].sort((a, b) => {
      const dA = a.deliveryDate || a.pickupDate || '';
      const dB = b.deliveryDate || b.pickupDate || '';
      return dB.localeCompare(dA);
    });
    const latestLoad = sorted[0];
    const canonicalId = latestLoad.driverId;
    const unitId = latestLoad.truckId || '';
    const unitHistory = [...new Set(allLoads.map((l) => l.truckId).filter(Boolean))];
    const mergedEmail = pickNonEmpty(driverIds.map((id) => driverDocById.get(id)?.email));
    const mergedPhone = pickNonEmpty(driverIds.map((id) => driverDocById.get(id)?.phoneNumber));

    if (driverIds.length > 1) {
      const toReassign = allLoads.filter((l) => l.driverId !== canonicalId);
      for (const load of toReassign) {
        await updateDoc(doc(loadsCollection, load.id), { driverId: canonicalId });
      }
      for (const id of driverIds) {
        if (id !== canonicalId) await deleteDoc(doc(driversCollection, id));
      }
    }
    await updateDoc(doc(driversCollection, canonicalId), {
      ...(payByName.has(name)
        ? {
            payType: payByName.get(name)!.payType,
            rate: payByName.get(name)!.rate,
          }
        : {}),
      ...(mergedEmail ? { email: mergedEmail } : {}),
      ...(mergedPhone ? { phoneNumber: mergedPhone } : {}),
      unitId,
      unitHistory,
    });
    const done = n + 1;
    const elapsed = Date.now() - mergeStartMs;
    const avgMsPerName = done > 0 ? elapsed / done : 0;
    const remaining = names.length - done;
    onProgress({
      phase: 'merging',
      current: done,
      total: names.length,
      message: `Merging drivers... ${done} of ${names.length} names`,
      estimatedMsRemaining: remaining > 0 && avgMsPerName > 0 ? Math.round(remaining * avgMsPerName) : 0,
    });
  }

  return { uniqueDrivers: names.length, loadsCreated, errors };
}
