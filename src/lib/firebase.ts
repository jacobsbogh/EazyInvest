import { initializeApp } from 'firebase/app';
import {
  getAuth,
  connectAuthEmulator,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import {
  loadWorkspace,
  saveWorkspace,
  loadMarket,
  loadRegistry,
  searchMarkets,
  queueHistory,
  loadHistoryRequests,
} from './cloud';
import { instruments, type Instrument } from '../../shared/catalog';
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
if (import.meta.env.VITE_USE_EMULATORS === 'true' && auth && db) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099');
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
}
export { onAuthStateChanged };
export async function login(email: string, password: string) {
  if (!auth) throw new Error('Firebase has not been connected yet.');
  await signInWithEmailAndPassword(auth, email.trim(), password);
}
export async function logout() {
  if (auth) await signOut(auth);
}
export async function loadCloud(uid: string) {
  if (!db) throw new Error('Firebase is not configured.');
  return loadWorkspace(db, uid);
}
export async function saveCloud(data: Workspace, revision: number) {
  if (!db || !auth?.currentUser) throw new Error('Sign in to save your workspace.');
  return saveWorkspace(db, auth.currentUser.uid, data, revision);
}
export async function fetchMarket(instrumentId: InstrumentId, catalog: Instrument[] = instruments) {
  if (!db) throw new Error('Connect Firebase to load market data.');
  const series = await loadMarket(db, instrumentId, catalog);
  if (!series) throw new Error('No provider data yet. Run the market-data workflow on GitHub.');
  return series;
}
export async function loadCachedMarket(catalog: Instrument[] = instruments) {
  if (!db) return [];
  const snapshots = await Promise.allSettled(
    catalog.map((item) => loadMarket(db!, item.id, catalog)),
  );
  return snapshots.flatMap((result) =>
    result.status === 'fulfilled' && result.value ? [result.value] : [],
  );
}
export async function fetchRegistry() {
  return db ? loadRegistry(db) : [];
}
export async function discoverInvestments(text: string) {
  if (!db || !auth?.currentUser) throw new Error('Sign in to search markets.');
  return searchMarkets(db, text);
}
export async function requestHistory(id: string) {
  if (!db || !auth?.currentUser) throw new Error('Sign in to request history.');
  return queueHistory(db, id);
}
export async function fetchHistoryRequests(ids: string[]) {
  return db ? loadHistoryRequests(db, ids) : [];
}
