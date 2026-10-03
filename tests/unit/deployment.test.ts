import { describe, expect, it } from 'vitest';
import { validateDeployConfig } from '../../scripts/check-deploy-config.mjs';

const configured = {
  VITE_FIREBASE_API_KEY: `AIza${'a'.repeat(35)}`,
  VITE_FIREBASE_AUTH_DOMAIN: 'eazyinvest-test.firebaseapp.com',
  VITE_FIREBASE_PROJECT_ID: 'eazyinvest-test',
  VITE_FIREBASE_APP_ID: '1:123456789:web:abcdef',
  VITE_BASE_PATH: '/EazyInvest/',
};
describe('release configuration guard', () => {
  it('accepts a real-shaped web configuration at a project or root path', () => {
    expect(validateDeployConfig(configured)).toEqual([]);
    expect(validateDeployConfig({ ...configured, VITE_BASE_PATH: '/' })).toEqual([]);
  });
  it.each([
    { VITE_FIREBASE_API_KEY: '' },
    { VITE_FIREBASE_PROJECT_ID: 'demo-eazyinvest' },
    { VITE_USE_EMULATORS: 'true' },
    { VITE_FIREBASE_APP_ID: '1:123:android:abcdef' },
    { VITE_FIREBASE_AUTH_DOMAIN: 'https://example.com/path' },
    { VITE_BASE_PATH: 'EazyInvest' },
  ])('rejects invalid production configuration %j', (override) => {
    expect(validateDeployConfig({ ...configured, ...override }).length).toBeGreaterThan(0);
  });
});
