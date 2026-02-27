'use client';

import { useState } from 'react';
import { useFirestore, useUser } from '@/firebase';
import { collection, getDocs, doc, setDoc, writeBatch, query, where, updateDoc } from 'firebase/firestore';

export default function MigrateArbaPage() {
    const firestore = useFirestore();
    const { user } = useUser();
    const [status, setStatus] = useState<string>('Ready to migrate.');
    const [loading, setLoading] = useState(false);

    const runMigration = async () => {
        if (!firestore) {
            setStatus('Firestore not initialized.');
            return;
        }
        if (!user) {
            setStatus('Must be logged in to migrate.');
            return;
        }

        setLoading(true);
        setStatus('Starting migration...');

        try {
            // 1. Find or create "Arba Express" company
            const companiesRef = collection(firestore, 'companies');
            const q = query(companiesRef, where('name', '==', 'Arba Express'));
            const querySnapshot = await getDocs(q);

            let targetCompanyId = '';

            if (querySnapshot.empty) {
                setStatus('Creating Arba Express company...');
                const newCompanyRef = doc(companiesRef);
                await setDoc(newCompanyRef, {
                    name: 'Arba Express',
                    createdAt: new Date().toISOString(),
                    ownerId: user.uid,
                    subscription: {
                        status: 'active',
                        plan: 'pro'
                    }
                });
                targetCompanyId = newCompanyRef.id;
            } else {
                targetCompanyId = querySnapshot.docs[0].id;
                setStatus(`Found Arba Express company: ${targetCompanyId}. Ensuring it has a Pro subscription...`);
                await updateDoc(doc(companiesRef, targetCompanyId), {
                    subscription: {
                        status: 'active',
                        plan: 'pro'
                    }
                });
            }

            if (!targetCompanyId) throw new Error("Failed to resolve company ID");

            // 2. Collections to migrate
            const collectionsToMigrate = ['loads', 'expenses', 'drivers', 'owners', 'receipts', 'accounts'];

            for (const collName of collectionsToMigrate) {
                setStatus(`Migrating collection: ${collName}...`);
                const oldCollRef = collection(firestore, collName);
                const oldDocsSnap = await getDocs(oldCollRef);

                if (oldDocsSnap.empty) {
                    setStatus(`No documents in ${collName}, skipping.`);
                    continue;
                }

                // Batch write to new location
                // Firestore batches have a limit of 500 operations
                let batch = writeBatch(firestore);
                let operationCount = 0;
                let batchCount = 1;

                for (const docSnap of oldDocsSnap.docs) {
                    const data = docSnap.data();
                    const newDocRef = doc(firestore, `companies/${targetCompanyId}/${collName}`, docSnap.id);
                    batch.set(newDocRef, data);
                    operationCount++;

                    if (operationCount === 450) {
                        setStatus(`Committing batch ${batchCount} for ${collName}...`);
                        await batch.commit();
                        batch = writeBatch(firestore);
                        operationCount = 0;
                        batchCount++;
                    }
                }

                if (operationCount > 0) {
                    setStatus(`Committing final batch for ${collName}...`);
                    await batch.commit();
                }
            }

            // 3. Update existing users to belong to Arba Express
            setStatus('Updating users to belong to Arba Express...');
            const usersRef = collection(firestore, 'users');
            const usersSnap = await getDocs(usersRef);

            let userBatch = writeBatch(firestore);
            let userOpCount = 0;

            for (const userSnap of usersSnap.docs) {
                const userData = userSnap.data();
                if (!userData.companyId) { // Only update if no companyId
                    userBatch.update(userSnap.ref, { companyId: targetCompanyId });
                    userOpCount++;
                }
            }

            if (userOpCount > 0) {
                await userBatch.commit();
            }

            setStatus('✅ Migration complete! Data has been copied to Arba Express company scope.');

        } catch (error: any) {
            console.error(error);
            setStatus(`❌ Error during migration: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="p-8 max-w-2xl mx-auto space-y-6">
            <h1 className="text-3xl font-bold">Data Migration Tool</h1>
            <p className="text-muted-foreground">
                This tool will copy all existing root-level data (loads, expenses, drivers, owners, receipts, accounts) into the "Arba Express" company subcollections. Ensure you are logged in.
            </p>

            <div className="p-4 bg-muted rounded-md font-mono text-sm min-h-24 whitespace-pre-wrap flex items-center">
                {status}
            </div>

            <button
                onClick={runMigration}
                disabled={loading}
                className="w-full py-2 bg-primary text-primary-foreground rounded-md disabled:opacity-50"
            >
                {loading ? 'Migrating...' : 'Run Migration'}
            </button>
        </div>
    );
}
