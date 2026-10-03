import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer, setDoc, terminate } from 'firebase/firestore';
import { instrumentIds, marketSchema } from '../../shared/schema.js';
import { getInstrument } from '../../shared/catalog.js';
import { fetchSeries } from './provider.js';

async function main() {
  const required = [
    'VITE_FIREBASE_API_KEY',
    'VITE_FIREBASE_PROJECT_ID',
    'VITE_FIREBASE_APP_ID',
    'MARKET_SYNC_EMAIL',
    'MARKET_SYNC_PASSWORD',
    'TWELVE_DATA_API_KEY',
  ] as const;
  if (required.some((key) => !process.env[key]))
    throw new Error('Configure the Firebase variables and market-sync secrets in GitHub Actions.');
  if (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST)
    throw new Error('This workflow is for the configured live project only.');
  const app = initializeApp({
    apiKey: process.env.VITE_FIREBASE_API_KEY,
    projectId: process.env.VITE_FIREBASE_PROJECT_ID,
    appId: process.env.VITE_FIREBASE_APP_ID,
  });
  const auth = getAuth(app);
  const db = getFirestore(app);
  let failed = 0;
  let lastRequest = 0;
  let requests = 0;
  try {
    await signInWithEmailAndPassword(
      auth,
      process.env.MARKET_SYNC_EMAIL!,
      process.env.MARKET_SYNC_PASSWORD!,
    );
    for (const id of instrumentIds) {
      try {
        const ref = doc(db, 'market', id);
        const current = await getDocFromServer(ref);
        const parsed = marketSchema.safeParse(current.data());
        if (
          parsed.success &&
          parsed.data.source === 'Twelve Data' &&
          Date.now() - Date.parse(parsed.data.fetchedAt) >= 0 &&
          Date.now() - Date.parse(parsed.data.fetchedAt) < 86400000
        ) {
          console.log(`${id}: recent cache retained`);
          continue;
        }
        const series = await fetchSeries(
          getInstrument(id),
          process.env.TWELVE_DATA_API_KEY!,
          async () => {
            if (++requests > 12) throw new Error('Per-run request limit reached.');
            await new Promise((resolve) =>
              setTimeout(resolve, Math.max(0, 8000 - (Date.now() - lastRequest))),
            );
            lastRequest = Date.now();
          },
        );
        await setDoc(ref, series);
        console.log(`${id}: provider data updated`);
      } catch {
        failed++;
        // Never print provider URLs, credential-bearing errors, or response bodies.
        console.error(
          `${id}: update failed; prior cache retained. Check coverage and writer permissions.`,
        );
      }
    }
  } finally {
    await signOut(auth);
    await terminate(db);
    await deleteApp(app);
  }
  if (failed) throw new Error(`${failed} instrument(s) could not update.`);
}
main().catch(() => {
  console.error(
    'Market sync incomplete. Check configured secrets, account access, and provider coverage.',
  );
  process.exitCode = 1;
});
