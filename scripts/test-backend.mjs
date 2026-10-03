import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { delimiter } from 'node:path';
const rulesOnly = process.argv.includes('--rules');
const browser = process.argv.includes('--browser');
const child = spawn(
  process.execPath,
  [
    'node_modules/firebase-tools/lib/bin/firebase.js',
    'emulators:exec',
    '--only',
    rulesOnly ? 'firestore' : 'auth,firestore',
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
  process.exit(code ?? 1);
});
child.on('error', (error) => {
  console.error(error.message);
  process.exit(1);
});
