import { initializeApp } from "firebase/app";
import { initializeFirestore, persistentLocalCache, getFirestore } from "firebase/firestore";

console.log(typeof initializeFirestore, typeof persistentLocalCache);
