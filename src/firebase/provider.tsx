'use client';

import React, { DependencyList, createContext, useContext, ReactNode, useMemo, useState, useEffect, useRef } from 'react';
import { FirebaseApp } from 'firebase/app';
import { Firestore, doc, getDoc, onSnapshot } from 'firebase/firestore';
import { Auth, User, onAuthStateChanged } from 'firebase/auth';
import { Functions } from 'firebase/functions';
import { FirebaseStorage } from 'firebase/storage';
import { FirebaseErrorListener } from '@/components/FirebaseErrorListener'

interface FirebaseProviderProps {
  children: ReactNode;
  firebaseApp: FirebaseApp;
  firestore: Firestore;
  auth: Auth;
  functions: Functions;
  storage: FirebaseStorage;
}

// Internal state for user authentication
interface UserAuthState {
  user: User | null;
  isUserLoading: boolean;
  userError: Error | null;
  companyId: string | null;
  companyName: string | null;
  company: any | null;
}

// Combined state for the Firebase context
export interface FirebaseContextState {
  areServicesAvailable: boolean; // True if core services (app, firestore, auth instance) are provided
  firebaseApp: FirebaseApp | null;
  firestore: Firestore | null;
  auth: Auth | null; // The Auth service instance
  functions: Functions | null;
  storage: FirebaseStorage | null;
  // User authentication state
  user: User | null;
  isUserLoading: boolean; // True during initial auth check
  userError: Error | null; // Error from auth listener
  companyId: string | null;
  companyName: string | null;
  company: any | null;
}

// Return type for useFirebase()
export interface FirebaseServicesAndUser {
  firebaseApp: FirebaseApp;
  firestore: Firestore;
  auth: Auth;
  functions: Functions;
  storage: FirebaseStorage;
  user: User | null;
  isUserLoading: boolean;
  userError: Error | null;
  companyId: string | null;
  companyName: string | null;
  company: any | null;
}

// Return type for useUser() - specific to user auth state
export interface UserHookResult {
  user: User | null;
  isUserLoading: boolean;
  userError: Error | null;
}

// React Context
export const FirebaseContext = createContext<FirebaseContextState | undefined>(undefined);

/**
 * FirebaseProvider manages and provides Firebase services and user authentication state.
 */
export const FirebaseProvider: React.FC<FirebaseProviderProps> = ({
  children,
  firebaseApp,
  firestore,
  auth,
  functions,
  storage,
}) => {
  const [userAuthState, setUserAuthState] = useState<UserAuthState>({
    user: null,
    isUserLoading: true, // Start loading until first auth event
    userError: null,
    companyId: null,
    companyName: null,
    company: null,
  });

  const unsubRef = useRef<{ user?: () => void; company?: () => void }>({});

  // Effect to subscribe to Firebase auth state changes
  useEffect(() => {
    if (!auth || !firestore) {
      setUserAuthState({ user: null, isUserLoading: false, userError: new Error("Auth/Firestore service not provided."), companyId: null, companyName: null, company: null });
      return;
    }

    setUserAuthState(prev => ({ ...prev, isUserLoading: true, userError: null }));

    const unsubscribeAuth = onAuthStateChanged(
      auth,
      (firebaseUser) => {
        unsubRef.current.user?.();
        unsubRef.current.company?.();
        unsubRef.current = {};

        if (firebaseUser) {
          const userDocRef = doc(firestore, 'users', firebaseUser.uid);

          unsubRef.current.user = onSnapshot(userDocRef, (userDoc) => {
            const companyId = userDoc.exists() ? userDoc.data()?.companyId || null : null;

            if (companyId) {
              const compDocRef = doc(firestore, 'companies', companyId);

              unsubRef.current.company = onSnapshot(compDocRef, (compDoc) => {
                let companyName = null;
                let company = null;
                if (compDoc.exists()) {
                  companyName = compDoc.data()?.name || null;
                  company = { id: compDoc.id, ...compDoc.data() };
                }
                setUserAuthState({ user: firebaseUser, isUserLoading: false, userError: null, companyId, companyName, company });
              }, (err) => {
                console.error("Error fetching company profile:", err);
                setUserAuthState({ user: firebaseUser, isUserLoading: false, userError: err, companyId, companyName: null, company: null });
              });
            } else {
              setUserAuthState({ user: firebaseUser, isUserLoading: false, userError: null, companyId: null, companyName: null, company: null });
            }
          }, (err) => {
            console.error("Error fetching user profile:", err);
            setUserAuthState({ user: firebaseUser, isUserLoading: false, userError: err, companyId: null, companyName: null, company: null });
          });
        } else {
          setUserAuthState({ user: null, isUserLoading: false, userError: null, companyId: null, companyName: null, company: null });
        }
      },
      (error) => {
        console.error("FirebaseProvider: onAuthStateChanged error:", error);
        setUserAuthState({ user: null, isUserLoading: false, userError: error, companyId: null, companyName: null, company: null });
      }
    );

    return () => {
      unsubscribeAuth();
      unsubRef.current.user?.();
      unsubRef.current.company?.();
      unsubRef.current = {};
    };
  }, [auth, firestore]);

  // Memoize the context value
  const contextValue = useMemo((): FirebaseContextState => {
    const servicesAvailable = !!(firebaseApp && firestore && auth && functions && storage);
    return {
      areServicesAvailable: servicesAvailable,
      firebaseApp: servicesAvailable ? firebaseApp : null,
      firestore: servicesAvailable ? firestore : null,
      auth: servicesAvailable ? auth : null,
      functions: servicesAvailable ? functions : null,
      storage: servicesAvailable ? storage : null,
      user: userAuthState.user,
      isUserLoading: userAuthState.isUserLoading,
      userError: userAuthState.userError,
      companyId: userAuthState.companyId,
      companyName: userAuthState.companyName,
      company: userAuthState.company,
    };
  }, [firebaseApp, firestore, auth, functions, storage, userAuthState]);

  return (
    <FirebaseContext.Provider value={contextValue}>
      <FirebaseErrorListener />
      {children}
    </FirebaseContext.Provider>
  );
};

/**
 * Hook to access core Firebase services and user authentication state.
 * Throws error if core services are not available or used outside provider.
 */
export const useFirebase = (): FirebaseServicesAndUser => {
  const context = useContext(FirebaseContext);

  if (context === undefined) {
    throw new Error('useFirebase must be used within a FirebaseProvider.');
  }

  if (!context.areServicesAvailable || !context.firebaseApp || !context.firestore || !context.auth || !context.functions || !context.storage) {
    throw new Error('Firebase core services not available. Check FirebaseProvider props.');
  }

  return {
    firebaseApp: context.firebaseApp,
    firestore: context.firestore,
    auth: context.auth,
    functions: context.functions,
    storage: context.storage,
    user: context.user,
    isUserLoading: context.isUserLoading,
    userError: context.userError,
    companyId: context.companyId,
    companyName: context.companyName,
    company: context.company,
  };
};

/** Hook to access Firebase Auth instance. */
export const useAuth = (): Auth => {
  const { auth } = useFirebase();
  return auth;
};

/** Hook to access Firestore instance. */
export const useFirestore = (): Firestore | null => {
  const context = useContext(FirebaseContext);
  if (context === undefined) {
    throw new Error('useFirestore must be used within a FirebaseProvider.');
  }
  return context.firestore;
};

/** Hook to access Firebase App instance. */
export const useFirebaseApp = (): FirebaseApp => {
  const { firebaseApp } = useFirebase();
  return firebaseApp;
};

/** Hook to access Cloud Functions instance. */
export const useFunctions = (): Functions => {
  const { functions } = useFirebase();
  return functions;
};

/** Hook to access Firebase Storage instance. */
export const useStorage = (): FirebaseStorage => {
  const { storage } = useFirebase();
  return storage;
};

type MemoFirebase<T> = T & { __memo?: boolean };

export function useMemoFirebase<T>(factory: () => T, deps: DependencyList): T | (MemoFirebase<T>) {
  const memoized = useMemo(factory, deps);

  if (typeof memoized !== 'object' || memoized === null) return memoized;
  (memoized as MemoFirebase<T>).__memo = true;

  return memoized;
}

/**
 * Hook specifically for accessing the authenticated user's state.
 * This provides the User object, loading status, and any auth errors.
 * @returns {UserHookResult} Object with user, isUserLoading, userError.
 */
export const useUser = (): UserHookResult => {
  const { user, isUserLoading, userError } = useFirebase();
  return { user, isUserLoading, userError };
};

export interface CompanyHookResult {
  companyId: string | null;
  companyName: string | null;
  company: any | null;
  isUserLoading: boolean;
  isCompanyLoading: boolean;
}

/**
 * Hook specifically for accessing the authenticated user's assigned company.
 * @returns {CompanyHookResult} Object with companyId and companyName.
 */
export const useCompany = (): CompanyHookResult => {
  const { companyId, companyName, company, isUserLoading } = useFirebase();
  return { companyId, companyName, company, isUserLoading, isCompanyLoading: isUserLoading };
};
