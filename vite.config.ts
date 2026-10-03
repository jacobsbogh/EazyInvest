import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: loadEnv(mode, process.cwd(), '').VITE_BASE_PATH || '/',
  build: {
    chunkSizeWarningLimit: 650,
    rollupOptions: {
      output: {
        manualChunks: {
          charts: ['recharts'],
          firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore', 'firebase/functions'],
        },
      },
    },
  },
}));
