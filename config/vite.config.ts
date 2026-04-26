import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
      port: 5173,
      host: '0.0.0.0',
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
      },
    },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      // Fix for crypto.getRandomValues is not a function in older node versions
      optimizeDeps: {
        esbuildOptions: {
            define: {
                global: 'globalThis'
            }
        }
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '..'),
        }
      }
    };
});
