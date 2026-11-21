import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    // Off Vite's default 5173 so it doesn't collide with other local projects; strict so the
    // proxy and `stx start` never end up pointing at a server that silently moved ports.
    port: 5190,
    strictPort: true,
    proxy: { '/api': { target: 'http://localhost:8790', ws: true } },
  },
});
