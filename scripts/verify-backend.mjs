import { loadEnv } from 'vite';
import { validateDeployConfig } from './check-deploy-config.mjs';

const env = loadEnv('production', process.cwd(), 'VITE_');
const errors = validateDeployConfig(env);
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
const project = env.VITE_FIREBASE_PROJECT_ID;
const firestore = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents`;
let failed = false;
async function denied(label, url, init, expectedStatus, expectedCode) {
  try {
    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(20000) });
    const body = await response.json();
    if (response.status !== expectedStatus || body.error?.status !== expectedCode)
      throw new Error(`expected ${expectedCode}, received HTTP ${response.status}`);
    console.log(`PASS ${label}: access denied`);
  } catch (error) {
    failed = true;
    console.error(`FAIL ${label}: ${error.message}`);
  }
}
// Read-only probes. Never create a user, write a record, or request provider data.
for (const path of ['config/access', 'users/anonymous-probe/workspace/current', 'market/vwce']) {
  await denied(path, `${firestore}/${path}`, {}, 403, 'PERMISSION_DENIED');
}
if (failed) process.exitCode = 1;
else
  console.log(
    'Anonymous probes passed. Also verify owner sign-in and an unrelated signed-in account before release.',
  );
