import { parseArgs } from 'node:util';
import { spawnSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { validateDeployConfig } from './check-deploy-config.mjs';

try {
  const { values } = parseArgs({
    options: {
      project: { type: 'string' },
      app: { type: 'string' },
      base: { type: 'string', default: '/' },
    },
  });
  if (!values.project || !values.app)
    throw new Error(
      'Usage: npm run configure:firebase -- --project PROJECT_ID --app WEB_APP_ID --base /EazyInvest/',
    );
  if (existsSync('.env.local'))
    throw new Error(
      '.env.local already exists. Review and edit it directly; this command will not overwrite it.',
    );
  const result = spawnSync(
    process.execPath,
    [
      'node_modules/firebase-tools/lib/bin/firebase.js',
      'apps:sdkconfig',
      'WEB',
      values.app,
      '--project',
      values.project,
      '--json',
      '--non-interactive',
    ],
    { encoding: 'utf8', env: { ...process.env, DEBUG: '' } },
  );
  let response;
  try {
    response = JSON.parse(result.stdout);
  } catch {
    /* handled below */
  }
  if (response?.status !== 'success')
    throw new Error(
      'Could not read the web app configuration. Run npm run firebase -- login and verify the project/app IDs.',
    );
  const config = response.result?.sdkConfig;
  if (config?.projectId !== values.project || config?.appId !== values.app)
    throw new Error(
      'The returned web app does not match the requested project/app. Nothing was written.',
    );
  const env = {
    VITE_FIREBASE_API_KEY: config.apiKey,
    VITE_FIREBASE_AUTH_DOMAIN: config.authDomain,
    VITE_FIREBASE_PROJECT_ID: config.projectId,
    VITE_FIREBASE_APP_ID: config.appId,
    VITE_USE_EMULATORS: 'false',
    VITE_BASE_PATH: values.base,
  };
  const errors = validateDeployConfig(env);
  if (errors.length) throw new Error(errors.join('\n'));
  if (result.status !== 0)
    console.warn(
      'Firebase returned a valid configuration but reported a CLI shutdown error. The project/app values were verified.',
    );
  writeFileSync(
    '.env.local',
    Object.entries(env)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n') + '\n',
    { flag: 'wx' },
  );
  console.log(
    'Created .env.local with public Firebase configuration. Restart Vite. No backend was deployed.',
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
