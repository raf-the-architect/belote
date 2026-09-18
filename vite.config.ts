import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    allowedHosts: true,
    hmr: { clientPort: 443 },
  },
  preview: { host: true, allowedHosts: true },
  // base relative : le site fonctionne à la racine d'un domaine comme dans un
  // sous-dossier (GitHub Pages /belote/, Netlify, ouverture locale du build…)
  base: './',
  build: { target: 'es2020', outDir: 'dist', sourcemap: false },
});
