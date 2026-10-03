import { spawn } from 'node:child_process';

const args = process.argv.slice(2);
// Firebase CLI returns account tokens, not just emails, for this JSON command.
if (args.includes('login:list') && args.includes('--json')) {
  console.error(
    'Use login:list without --json. Firebase includes credentials in the JSON response.',
  );
  process.exit(1);
}
// Avoid inherited DEBUG causing account/environment details to enter CLI logs.
const child = spawn(
  process.execPath,
  ['node_modules/firebase-tools/lib/bin/firebase.js', ...args],
  { stdio: 'inherit', env: { ...process.env, DEBUG: '' } },
);
child.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
