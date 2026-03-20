/**
 * Destructive reset script:
 * - Deletes the Firestore company document (and all its subcollections)
 * - Deletes all Firestore user docs for that company
 * - Deletes Firebase Auth users corresponding to those Firestore user docs
 *
 * This lets you register again for the same email with a clean slate.
 *
 * WARNING: This will permanently delete data in your Firebase project.
 *
 * Usage:
 *   npx tsx scripts/reset-company-and-auth.ts --email someone@example.com --yes
 *   npx tsx scripts/reset-company-and-auth.ts --companyId <id> --yes
 *
 * Optional:
 *   --dryRun   (prints what it would delete, does not delete)
 */

import admin from "firebase-admin";
import type { ServiceAccount } from "firebase-admin";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const serviceAccount = require("../service-account-key.json") as ServiceAccount & { project_id?: string };

function parseArg(name: string): string | undefined {
  const idx = process.argv.findIndex((a) => a === name);
  if (idx === -1) return undefined;
  const next = process.argv[idx + 1];
  return next && !next.startsWith("--") ? next : undefined;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

async function ensureAdminInitialized() {
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: serviceAccount.project_id,
    });
  }
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function deleteDocTree(docRef: FirebaseFirestore.DocumentReference) {
  // Recursively delete all docs in all nested subcollections.
  const subcollections = await docRef.listCollections();
  for (const sub of subcollections) {
    const snap = await sub.get();
    for (const d of snap.docs) {
      await deleteDocTree(d.ref);
    }
    // After nested docs are removed, delete the remaining docs in this level.
    // (They will already be gone for deeper paths, but .delete() is safe to retry.)
    for (const d of snap.docs) {
      await d.ref.delete();
    }
  }
  await docRef.delete();
}

async function main() {
  await ensureAdminInitialized();

  const email = parseArg("--email");
  const companyIdArg = parseArg("--companyId");
  const dryRun = hasFlag("--dryRun");
  const yes = hasFlag("--yes");

  if (!yes && !dryRun) {
    console.error("Refusing to run without --yes (or use --dryRun).");
    process.exit(2);
  }

  const auth = admin.auth();
  const firestore = admin.firestore();

  let companyId = companyIdArg;

  if (!companyId) {
    if (!email) {
      console.error("Provide either --email or --companyId.");
      process.exit(2);
    }

    const userRecord = await auth.getUserByEmail(email).catch(() => null);
    if (!userRecord) {
      console.error(`No Firebase Auth user found for email: ${email}`);
      process.exit(1);
    }

    const userDoc = await firestore.collection("users").doc(userRecord.uid).get();
    if (!userDoc.exists) {
      console.error(`No Firestore user doc found at users/${userRecord.uid}`);
      process.exit(1);
    }

    const userData = userDoc.data() as { companyId?: string } | undefined;
    if (!userData?.companyId) {
      console.error(`User doc users/${userRecord.uid} has no companyId.`);
      process.exit(1);
    }

    companyId = userData.companyId;
  }

  console.log(`Target companyId: ${companyId}`);

  // Find all Firestore user docs for that company (these indicate which auth users to delete).
  const usersSnap = await firestore.collection("users").where("companyId", "==", companyId).get();
  const userUids = usersSnap.docs.map((d) => d.id);
  console.log(`Found ${userUids.length} Firestore user(s) for this company.`);

  if (dryRun) {
    console.log("DRY RUN: exiting without deleting anything.");
    console.log(`Would delete Firestore company doc: companies/${companyId}`);
    console.log(`Would delete Auth users: ${userUids.join(", ") || "(none)"}`);
    process.exit(0);
  }

  // 1) Delete company doc + all nested subcollections.
  console.log(`Deleting Firestore company tree: companies/${companyId} ...`);
  await deleteDocTree(firestore.collection("companies").doc(companyId));

  // 2) Delete auth users (in batches).
  if (userUids.length > 0) {
    console.log(`Deleting Firebase Auth users in batches...`);
    for (const batch of chunk(userUids, 1000)) {
      await auth.deleteUsers(batch);
    }
  }

  // 3) Delete user docs (best-effort; company deletion might already removed some).
  console.log(`Deleting Firestore user docs...`);
  for (const uid of userUids) {
    await firestore.collection("users").doc(uid).delete().catch(() => null);
  }

  console.log("Reset complete.");
}

main().catch((err) => {
  console.error("Reset script failed:", err);
  process.exit(1);
});

