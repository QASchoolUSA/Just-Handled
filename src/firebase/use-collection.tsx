'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  collection,
  onSnapshot,
  Query,
  DocumentData,
  query,
  where,
  WhereFilterOp,
  orderBy,
  OrderByDirection,
} from 'firebase/firestore';
import { useFirestore, useCompany } from './provider';
import type { WithId } from '../lib/types';

interface CollectionQuery<T> {
  path: string;
  where?: [string, WhereFilterOp, any] | [string, WhereFilterOp, any][];
  orderBy?: [string, OrderByDirection];
}

export function useCollection<T extends DocumentData>(
  pathOrQuery: string | CollectionQuery<T>
) {
  const [data, setData] = useState<WithId<T>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const firestore = useFirestore();
  const { companyId } = useCompany();

  const collectionQuery = useMemo(() => {
    if (!firestore || !companyId) return null;

    const { path, where: whereClause, orderBy: orderByClause } = typeof pathOrQuery === 'string'
      ? { path: pathOrQuery }
      : pathOrQuery;

    // Ensure backwards compatibility with explicit company paths but auto-scope others
    const scopedPath = path.startsWith('companies/') ? path : `companies/${companyId}/${path}`;

    let q: Query<DocumentData> = collection(firestore, scopedPath);

    if (whereClause) {
      if (Array.isArray(whereClause[0])) {
        // Handle multiple where clauses
        (whereClause as [string, WhereFilterOp, any][]).forEach(w => {
          q = query(q, where(w[0], w[1], w[2]));
        });
      } else {
        // Handle single where clause
        const w = whereClause as [string, WhereFilterOp, any];
        q = query(q, where(w[0], w[1], w[2]));
      }
    }
    if (orderByClause) {
      q = query(q, orderBy(orderByClause[0], orderByClause[1]));
    }
    return q;
  }, [firestore, companyId, pathOrQuery]);

  useEffect(() => {
    if (!firestore) {
      // Still waiting for firestore instance, do nothing yet
      return;
    }

    if (!collectionQuery) {
      setLoading(false);
      return;
    };

    setLoading(true);

    const unsubscribe = onSnapshot(
      collectionQuery,
      (snapshot) => {
        const result: WithId<T>[] = [];
        snapshot.forEach((doc) => {
          result.push({ id: doc.id, ...doc.data() } as WithId<T>);
        });
        setData(result);
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error(`Error fetching collection:`, err);
        setError(err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [collectionQuery, firestore]);

  return { data, loading, error };
}
