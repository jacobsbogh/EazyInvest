import { initializeApp } from 'firebase/app';
import {
  getAuth,
  connectAuthEmulator,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, doc, getDoc } from 'firebase/firestore';
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions';
import { storedSchema, marketSchema } from '../../shared/schema';
import type { Workspace, InstrumentId } from '../../shared/schema';

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};
export const firebaseConfigured = Object.values(config).every(Boolean);
export const firebasePartial = Object.values(config).some(Boolean) && !firebaseConfigured;
const app = firebaseConfigured ? initializeApp(config) : null;
export const auth = app ? getAuth(app) : null;
const db = app ? getFirestore(app) : null;
const functions = app
  ? getFunctions(app, import.meta.env.VITE_FIREBASE_FUNCTIONS_REGION || 'europe-west1')
  : null;
if (import.meta.env.VITE_USE_EMULATORS === 'true' && auth && db && functions) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099');
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
}
export { onAuthStateChanged };
export async function login() {
  if (!auth) throw new Error('Firebase has not been connected yet.');
  await signInWithPopup(auth, new GoogleAuthProvider());
}
export async function logout() {
  if (auth) await signOut(auth);
}
export async function loadCloud(uid: string) {
  if (!db) throw new Error('Firebase is not configured.');
  const snapshot = await getDoc(doc(db, 'users', uid, 'workspace', 'current'));
  return snapshot.exists() ? storedSchema.parse(snapshot.data()) : null;
}
export async function saveCloud(data: Workspace, revision: number) {
  if (!functions) throw new Error('Firebase is not configured.');
  const result = await httpsCallable(functions, 'saveWorkspace')({ data, revision });
  return storedSchema.parse(result.data);
}
export async function fetchMarket(instrumentId: InstrumentId) {
  if (!functions) throw new Error('Connect Firebase to load market data.');
  const result = await httpsCallable(functions, 'getMarketSeries')({ instrumentId });
  return marketSchema.parse(result.data);
}
export async function loadCachedMarket() {
  if (!db) return [];
  const ids: InstrumentId[] = ['vwce', 'eunl', 'is3n', 'sxr8', 'novo', 'msft'];
  const snapshots = await Promise.all(ids.map((id) => getDoc(doc(db, 'market', id))));
  return snapshots
    .filter((snapshot) => snapshot.exists())
    .map((snapshot) => marketSchema.parse(snapshot.data()));
}
