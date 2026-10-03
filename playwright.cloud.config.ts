import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/cloud',
  workers: 1,
  timeout: 45000,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:4174/EazyInvest/', trace: 'retain-on-failure' },
  webServer: {
    command:
      'npm run build -- --outDir .cache/cloud-dist && npm run preview -- --outDir .cache/cloud-dist --port 4174 --strictPort',
    url: 'http://127.0.0.1:4174/EazyInvest/',
    reuseExistingServer: false,
    timeout: 120000,
    env: {
      VITE_FIREBASE_API_KEY: 'demo-key',
      VITE_FIREBASE_AUTH_DOMAIN: 'demo-eazyinvest.firebaseapp.com',
      VITE_FIREBASE_PROJECT_ID: 'demo-eazyinvest',
      VITE_FIREBASE_APP_ID: 'demo-app',
      VITE_USE_EMULATORS: 'true',
      VITE_BASE_PATH: '/EazyInvest/',
    },
  },
  projects: [{ name: 'cloud-chromium', use: { ...devices['Desktop Chrome'] } }],
});
