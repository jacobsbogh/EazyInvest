import { spawn } from 'node:child_process';

// Avoid inherited DEBUG causing account/environment details to enter CLI logs.
const child = spawn(
  process.execPath,
  ['node_modules/firebase-tools/lib/bin/firebase.js', ...process.argv.slice(2)],
  { stdio: 'inherit', env: { ...process.env, DEBUG: '' } },
);
child.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
