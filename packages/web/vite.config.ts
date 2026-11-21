import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    // `pnpm --filter @onthestack/server dev` serves the API and game sockets on wrangler's default port.
    proxy: { '/api': { target: 'http://localhost:8787', ws: true } },
  },
});
