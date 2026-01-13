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
import { useFirestore } from './provider';
import type { WithId } from '../lib/types';

interface CollectionQuery<T> {
  path: string;
  where?: [string, WhereFilterOp, any];
  orderBy?: [string, OrderByDirection];
}

export function useCollection<T extends DocumentData>(
  pathOrQuery: string | CollectionQuery<T>
) {
  const [data, setData] = useState<WithId<T>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const firestore = useFirestore();

  const collectionQuery = useMemo(() => {
    if (!firestore) return null;

    const { path, where: whereClause, orderBy: orderByClause } = typeof pathOrQuery === 'string'
      ? { path: pathOrQuery }
      : pathOrQuery;

    let q: Query<DocumentData> = collection(firestore, path);

    if (whereClause) {
      q = query(q, where(whereClause[0], whereClause[1], whereClause[2]));
    }
    if (orderByClause) {
      q = query(q, orderBy(orderByClause[0], orderByClause[1]));
    }
    return q;
  }, [firestore, pathOrQuery]);

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
