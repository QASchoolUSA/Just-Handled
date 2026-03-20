/**
 * One-off script to link an auth user to a company in Firestore.
 *
 * Usage:
 *   # 1) Ensure you have Firebase Admin credentials available, e.g.:
 *   #    export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
 *   #
 *   # 2) From the project root, run:
 *   #    npx tsx scripts/link-user-to-company.ts
 */

import admin from "firebase-admin";
import type { ServiceAccount } from "firebase-admin";
// IMPORTANT: this script assumes you have a local
// `service-account-key.json` file at the project root.
// Do NOT commit that file to a public repo.
// If you prefer to use GOOGLE_APPLICATION_CREDENTIALS instead,
// you can revert to applicationDefault() and remove the import below.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const serviceAccount = require("../service-account-key.json") as ServiceAccount & { project_id?: string };

// --- CONFIGURE THESE VALUES AS NEEDED ---
const TARGET_EMAIL = "qaschoolusa@gmail.com";
const TARGET_COMPANY_ID = "emvfE5NoIYpyBuLRzutj";
const DEFAULT_ROLE = "admin";
// ----------------------------------------

async function linkUserToCompany(email: string, companyId: string) {
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: serviceAccount.project_id,
    });
  }

  const auth = admin.auth();
  const firestore = admin.firestore();

  // Look up the user by email
  const userRecord = await auth.getUserByEmail(email);

  const userRef = firestore.collection("users").doc(userRecord.uid);

  // Merge into existing user doc if present
  await userRef.set(
    {
      email,
      displayName: userRecord.displayName || email,
      companyId,
      role: DEFAULT_ROLE,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  console.log(`Linked ${email} (uid: ${userRecord.uid}) to company ${companyId}`);

  // Also ensure the company subscription is set to Pro/Active
  const companyRef = firestore.collection("companies").doc(companyId);
  await companyRef.set(
    {
      subscription: {
        status: "active",
        plan: "pro",
        // trialEndsAt can be omitted for active Pro plans
      },
    },
    { merge: true },
  );

  console.log(`Updated company ${companyId} subscription to Pro/Active.`);
}

linkUserToCompany(TARGET_EMAIL, TARGET_COMPANY_ID)
  .then(() => {
    console.log("Done.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Error linking user to company:", err);
    process.exit(1);
  });

