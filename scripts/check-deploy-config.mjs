import { pathToFileURL } from 'node:url';
import { loadEnv } from 'vite';

const required = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_APP_ID',
];
export function validateDeployConfig(env) {
  const errors = [];
  const missing = required.filter((key) => !env[key]?.trim());
  if (missing.length) errors.push(`Deployment stopped: configure ${missing.join(', ')}.`);
  if (env.VITE_USE_EMULATORS && env.VITE_USE_EMULATORS !== 'false')
    errors.push('Deployment stopped: emulator mode must be disabled.');
  if (
    env.VITE_FIREBASE_PROJECT_ID &&
    (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(env.VITE_FIREBASE_PROJECT_ID) ||
      env.VITE_FIREBASE_PROJECT_ID.startsWith('demo-'))
  )
    errors.push('Deployment stopped: use a real Firebase project ID.');
  if (
    env.VITE_FIREBASE_AUTH_DOMAIN &&
    !/^(?!localhost$)[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/i.test(
      env.VITE_FIREBASE_AUTH_DOMAIN,
    )
  )
    errors.push('Deployment stopped: Auth domain must be a hostname without a scheme or path.');
  if (env.VITE_FIREBASE_APP_ID && !/^1:\d+:web:[a-z0-9]+$/i.test(env.VITE_FIREBASE_APP_ID))
    errors.push('Deployment stopped: use the Firebase web app ID.');
  if (env.VITE_FIREBASE_API_KEY && !/^AIza[\w-]{35}$/.test(env.VITE_FIREBASE_API_KEY))
    errors.push('Deployment stopped: use the Firebase public web API key.');
  if ((env.VITE_FIREBASE_FUNCTIONS_REGION || 'europe-west1') !== 'europe-west1')
    errors.push('Deployment stopped: frontend region must match the backend (europe-west1).');
  if (!/^\/(?:[a-z0-9_.-]+\/)*$/i.test(env.VITE_BASE_PATH || '/'))
    errors.push(
      'Deployment stopped: base path must start and end with /, for example /EazyInvest/.',
    );
  return errors;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const errors = validateDeployConfig(loadEnv('production', process.cwd(), 'VITE_'));
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exitCode = 1;
  } else
    console.log(
      'Public client configuration is valid. Deployed access rules still need verification.',
    );
}
