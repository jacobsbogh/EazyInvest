import { spawnSync } from 'node:child_process';
for (const config of ['vitest.backend.config.ts', 'vitest.rules.config.ts']) {
  const result = spawnSync(
    process.execPath,
    ['node_modules/vitest/vitest.mjs', 'run', '--config', config],
    { stdio: 'inherit', env: process.env },
  );
  if (result.status !== 0) process.exit(result.status ?? 1);
}
