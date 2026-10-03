import { spawnSync } from 'node:child_process';
import { loadEnv } from 'vite';
import { validateDeployConfig } from './check-deploy-config.mjs';

const env = { ...loadEnv('production', process.cwd(), 'VITE_'), ...process.env };
if (process.env.PAGES_BASE_PATH !== undefined) {
  env.VITE_BASE_PATH = `${process.env.PAGES_BASE_PATH.replace(/\/$/, '')}/`;
}
const errors = validateDeployConfig(env);
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
for (const args of [
  ['node_modules/typescript/bin/tsc', '-b'],
  ['node_modules/vite/bin/vite.js', 'build'],
]) {
  const result = spawnSync(process.execPath, args, { stdio: 'inherit', env });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
