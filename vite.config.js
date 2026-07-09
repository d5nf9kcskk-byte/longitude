import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base matches the GitHub Pages URL: https://<owner>.github.io/longitude/
export default defineConfig({
  plugins: [react()],
  base: '/longitude/',
});
