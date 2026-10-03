import { spawn } from 'node:child_process';
import { existsSync, writeFileSync, unlinkSync } from 'node:fs';
import { delimiter } from 'node:path';
// Local dummy secret only; never use real provider credentials during emulator tests.
const file = 'functions/.secret.local';
const rulesOnly = process.argv.includes('--rules');
const browser = process.argv.includes('--browser');
const created = !rulesOnly && !existsSync(file);
if (created) writeFileSync(file, 'TWELVE_DATA_API_KEY=local-test-placeholder\n');
const child = spawn(
  process.execPath,
  [
    'node_modules/firebase-tools/lib/bin/firebase.js',
    'emulators:exec',
    '--only',
    rulesOnly ? 'firestore' : 'auth,firestore,functions',
    '--project',
    'demo-eazyinvest',
    rulesOnly
      ? 'vitest run --config vitest.rules.config.ts'
      : browser
        ? 'playwright test --config playwright.cloud.config.ts'
        : 'node scripts/emulator-suite.mjs',
  ],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      DEBUG: '',
      ...(process.env.JAVA_HOME
        ? { PATH: `${process.env.JAVA_HOME}/bin${delimiter}${process.env.PATH}` }
        : process.platform === 'win32' &&
            existsSync('C:/Program Files/Android/Android Studio/jbr/bin/java.exe')
          ? {
              JAVA_HOME: 'C:/Program Files/Android/Android Studio/jbr',
              PATH: `C:/Program Files/Android/Android Studio/jbr/bin${delimiter}${process.env.PATH}`,
            }
          : {}),
    },
  },
);
child.on('exit', (code) => {
  if (created) unlinkSync(file);
  process.exit(code ?? 1);
});
child.on('error', (error) => {
  if (created) unlinkSync(file);
  console.error(error.message);
  process.exit(1);
});
