# Production Readiness Audit

**Role:** Senior Full-Stack Architect & Performance Engineer  
**Scope:** Next.js (App Router) + Firebase  
**Date:** Audit across 5 modules

---

## 1. Critical Issues

### 1.1 Firestore Security Rules — Multi-Tenant Data Exposure

**Issue:** Rules use a catch-all that allows any authenticated user to read/write any document:

```javascript
match /{document=**} {
  allow read, write: if request.auth != null;
}
```

**Risk:** Company A can read/write Company B’s data (`companies/{companyB}/loads`, etc.). This is a critical security vulnerability for a multi-tenant app.

**Fix:** Scope all access by company and ensure the user’s `companyId` (from `/users/{uid}`) matches the path.

---

### 1.2 Firebase Provider — Listener Cleanup Race

**Issue:** In `src/firebase/provider.tsx`, `unsubscribeUser` and `unsubscribeCompany` are declared with `let` and assigned asynchronously inside `onAuthStateChanged` and nested `onSnapshot` callbacks. The effect cleanup runs when dependencies change or on unmount; at that moment the closure may still hold `undefined` or a stale reference, so the wrong (or no) listener may be unsubscribed.

**Location:** `provider.tsx` lines 99–105, 152–155.

**Fix:** Store unsubscribers in a ref so cleanup always calls the latest functions.

---

### 1.3 Document Center — N+1 Firestore Queries

**Issue:** For each extracted receipt in `extractedReceipts`, the code runs two `getDocs` calls (owners by `unitId`, drivers by `unitId`). With 10 receipts that’s 20 reads per file; with many files this multiplies quickly.

**Location:** `src/app/document-center/page.tsx` ~454–500 (inside `for (const receipt of extractedReceipts)`).

**Fix:** Before the loop, load once: all drivers and all owners (or a single query per collection), build `Map<unitId, Driver>` and `Map<unitId, Owner>`, then in the loop do in-memory lookups only.

---

### 1.4 Unbounded Firestore Queries (Cost / Performance)

**Issue:** Several listeners/queries have no `limit()`:

- **Factoring upload history:** `orderBy('createdAt', 'desc')` with no `limit` — every page load reads the full collection.
- **Drivers page (earnings):** Fetches full `loads` and `expenses` collections then filters by date in memory — high read cost and bundle for large datasets.
- **Reports page:** When `fromStr`/`toStr` are missing, falls back to full collection: `return collection(firestore, ...)` with no `where` or `limit`.

**Fix:** Add `limit(100)` (or similar) to factoring history; for drivers/reports use date-bounded queries and avoid “fetch all then filter” where possible.

---

### 1.5 Silent Failures / Missing UI Error State

**Issue:** Many `catch` blocks only `console.error` and do not set component error state or show user-facing feedback (e.g. profile fetch, company fetch, document-center `fetchData`, some import paths). Users see no indication of failure.

**Fix:** Ensure every async path has a catch that updates local state (e.g. `setError`) and that the UI shows a clear message and optional retry.

---

## 2. Optimizations

### 2.1 Next.js & Frontend

| Area | Finding | Recommendation |
|------|---------|----------------|
| **'use client'** | Many pages are fully client (e.g. drivers, settlements, dashboard). | Keep client where needed for Firebase hooks/state. Consider moving static shells or non-interactive sections to Server Components and passing data as props. |
| **Fonts** | `layout.tsx` uses external Google Fonts via `<link>`. | Use `next/font` (e.g. `next/font/google`) to self-host and reduce layout shift (CLS) and extra round-trips. |
| **Images** | No `next/image` usage found. | Use `next/image` for any images to get lazy loading, sizing, and CLS avoidance. |
| **Lodash** | Present in lockfile (transitive, e.g. from Radix/other deps). | No direct `import from 'lodash'` in app code; keep using `date-fns` and native JS where possible. |
| **firebase-admin** | In root `package.json` dependencies. | Ensure it’s only used in server/API routes or move to a separate backend package. Do not import in client bundle. |

### 2.2 Firebase Efficiency

- **Listener cleanup:** `useCollection` and `use-doc` (firestore) correctly return `() => unsubscribe()` from `useEffect`. Keep this pattern; fix only the provider as in 1.2.
- **SDK:** Imports use `firebase/firestore`, `firebase/auth`, etc. (modular v9+). Good; no legacy compat bundle.
- **Batching:** Document-center receipt processing can use a single batch or batched reads (see 1.3) to cut read count and improve latency.

### 2.3 Algorithmic & Data Flow

- **Driver earnings:** Uses `Map` for driver lookup and single-pass aggregation — O(n). Good.
- **Memoization:** Many pages use `useMemo` for derived data (e.g. driverEarnings, filtered lists). Ensure any heavy computation or large lists are memoized and dependencies are minimal to avoid unnecessary recalc.
- **Settlements / reports:** If you have nested loops (e.g. loads × drivers) without a Map, refactor to prebuild a `driverMap` and do O(1) lookups (already done in several places; keep the pattern everywhere).

### 2.4 Hardening & Security

- **Env vars:** Only Firebase client config uses `NEXT_PUBLIC_*`. Correct; no server secrets exposed.
- **Security rules:** Must be fixed as in 1.1 before production.

---

## 3. Code Comparison: Before vs After

### 3.1 Firestore Rules — Company-Scoped Access

**Before (insecure):**

```javascript
match /{document=**} {
  allow read, write: if request.auth != null;
}
```

**After (conceptual):**

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    match /companies/{companyId}/{document=**} {
      allow read, write: if request.auth != null
        && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.companyId == companyId;
    }
    match /receipts/{receiptId} { /* keep existing if still used */ }
    match /units/{unitId} { /* keep existing if still used */ }
  }
}
```

Adjust paths to match your real schema (e.g. where `companyId` is stored) and add any other collections with the same company-scoped pattern.

---

### 3.2 Provider — Safe Listener Cleanup

**Before:**

```javascript
let unsubscribeUser: () => void;
let unsubscribeCompany: () => void;

const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
  if (unsubscribeUser) unsubscribeUser();
  if (unsubscribeCompany) unsubscribeCompany();
  // ... assign unsubscribeUser = onSnapshot(...), unsubscribeCompany = onSnapshot(...)
});

return () => {
  unsubscribeAuth();
  if (unsubscribeUser) unsubscribeUser();
  if (unsubscribeCompany) unsubscribeCompany();
};
```

**After:**

```javascript
const unsubRef = useRef<{ user?: () => void; company?: () => void }>({});

const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
  unsubRef.current.user?.();
  unsubRef.current.company?.();
  unsubRef.current = {};
  if (firebaseUser) {
    const userDocRef = doc(firestore, 'users', firebaseUser.uid);
    unsubRef.current.user = onSnapshot(userDocRef, (userDoc) => {
      const companyId = userDoc.exists() ? userDoc.data()?.companyId : null;
      unsubRef.current.company?.();
      if (companyId) {
        const compDocRef = doc(firestore, 'companies', companyId);
        unsubRef.current.company = onSnapshot(compDocRef, ...);
      } else {
        setUserAuthState({ ... });
      }
    }, ...);
  } else {
    setUserAuthState({ ... });
  }
});

return () => {
  unsubscribeAuth();
  unsubRef.current.user?.();
  unsubRef.current.company?.();
};
```

This ensures cleanup always runs the latest user/company unsubscribes.

---

### 3.3 Document Center — Eliminate N+1

**Before (per receipt):**

```javascript
for (const receipt of extractedReceipts) {
  if (receipt.unit_id) {
    const snapOwner = await getDocs(query(collection(..., 'owners'), where('unitId', '==', cleanUnitId), limit(1)));
    const snapDriver = await getDocs(query(collection(..., 'drivers'), where('unitId', '==', cleanUnitId), limit(1)));
    // ...
  }
}
```

**After:**

```javascript
const driversSnap = await getDocs(collection(firestore, `companies/${companyId}/drivers`));
const ownersSnap = await getDocs(collection(firestore, `companies/${companyId}/owners`));
const unitToOwner = new Map<string, { id: string; name: string }>();
const unitToDriver = new Map<string, { id: string; firstName: string; lastName: string }>();
ownersSnap.docs.forEach(d => {
  const data = d.data();
  if (data.unitId) unitToOwner.set(String(data.unitId).trim(), { id: d.id, name: data.name });
});
driversSnap.docs.forEach(d => {
  const data = d.data();
  if (data.unitId) unitToDriver.set(String(data.unitId).trim(), { id: d.id, ...data });
});

for (const receipt of extractedReceipts) {
  const cleanUnitId = receipt.unit_id?.trim();
  if (cleanUnitId) {
    const owner = unitToOwner.get(cleanUnitId);
    const driver = unitToDriver.get(cleanUnitId);
    if (owner) { matchedOwnerId = owner.id; expenseOwner = owner.name; expenseType = 'owner'; }
    if (driver && !matchedOwnerId) { matchedDriverId = driver.id; expenseOwner = `${driver.firstName} ${driver.lastName}`; expenseType = 'driver'; }
  }
  // ... create expense
}
```

This replaces 2N reads with 2 reads per file.

---

### 3.4 Factoring History — Add limit()

**Before:**

```javascript
const q = query(
  collection(firestore, `companies/${companyId}/factoringUploads`),
  orderBy('createdAt', 'desc')
);
```

**After:**

```javascript
const q = query(
  collection(firestore, `companies/${companyId}/factoringUploads`),
  orderBy('createdAt', 'desc'),
  limit(100)
);
```

---

## 4. Hidden Killers

- **Cloud Functions:** Document center uses `analyzeDocs`; if it’s heavy, consider min instances or splitting work to avoid long cold starts on critical paths.
- **Middleware:** No `middleware.ts` in the repo; no extra work on every request. Good.
- **Hydration / auth flicker:** `AuthGuard` shows a loading UI until `isUserLoading` is false, then redirects if no user. Because auth state is async, there is a short period where the guard can render the loader then switch to children or redirect. Using a single loading screen until both auth and company are resolved (as the provider does) keeps flicker minimal; ensure no protected content is rendered before that.

---

## 5. Production Checklist

1. **Security:** Deploy Firestore rules that restrict access by `companyId` (and any other tenant id) so no user can read or write another company’s data. Remove the catch-all `match /{document=**}`.
2. **Firebase cleanup:** Fix the provider’s listener cleanup using a ref (or equivalent) so every `onSnapshot` is unsubscribed on auth change or unmount.
3. **Cost/performance:** Add `limit()` to factoring upload history; replace document-center N+1 with one-off driver/owner fetch and Maps; avoid unbounded “fetch all then filter” on drivers/reports where possible (use date range queries).
4. **Errors:** Add user-visible error state and messaging for profile fetch, company fetch, document-center fetch, and critical import/export paths; ensure every async call has a catch that updates UI or logs in a structured way.
5. **Frontend:** Switch to `next/font` for Google Fonts, use `next/image` for any images, and confirm `firebase-admin` is never imported in client code (only in server/API or a separate service).

---

---

## 6. Implementation Status (Post-Audit)

The following were implemented:

- **Firestore rules:** Replaced catch-all with company-scoped rules (`users/{userId}`, `companies/{companyId}`, `companies/{companyId}/{document=**}`). Legacy `receipts` and `units` kept with auth-only.
- **Firebase provider:** Listener cleanup now uses a `useRef` so cleanup always unsubscribes the latest user/company listeners.
- **Document Center:** Single fetch of drivers and owners per file; built `unitToOwner` and `unitToDriver` Maps; per-receipt lookups are in-memory (no N+1).
- **Factoring:** Added `limit(100)` to the factoring upload history query and imported `limit` from Firestore.
- **Reports:** When date range is missing, loads and expenses queries now use `limit(5000)` instead of unbounded collection.
- **Error handling:** Profile page shows dismissible `fetchError` banner; Document Center shows `unitsLoadError` banner; AuthGuard shows `userError` with Retry when auth/profile load fails.
- **next/font:** Layout now uses `next/font/google` for Inter and Outfit with CSS variables; removed external Google Fonts `<link>`. Tailwind `fontFamily` updated to use `var(--font-inter)` and `var(--font-outfit)`.
- **firebase-admin check:** Confirmed no `firebase-admin` or `firebase/admin` imports under `src/`. It is only used in `scripts/link-user-to-company.ts` and `functions/src/index.ts`, so it does not ship in the Next.js client bundle.
- **Document Center receipt load error:** Added `receiptsLoadError` state; the receipts `onSnapshot` error callback sets it and the success path clears it. A dismissible banner shows when receipt list fails to load (same pattern as `unitsLoadError`).

*End of audit.*
