import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Set VITE_BASE=/pg-catalog-almanac/ for GitHub Pages builds; default '/' works
// for local dev and the Docker/nginx image.
export default defineConfig({
  base: process.env.VITE_BASE || '/',
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
});
