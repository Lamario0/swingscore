import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {fileURLToPath} from 'url';
import {defineConfig} from 'vite';

// server.ts loads this file as a native ES module, which has no __dirname.
const configDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(configDir, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      // data.json is the app's runtime persistence file -- server.ts rewrites it on every
      // settings/heat/score/check-in change -- and it lives in the project root, which the
      // default watch scope covers. Vite doesn't hot-reload it (it isn't imported by any
      // module), so this exclusion is just hygiene: it keeps the dev watcher from doing
      // needless work reacting to a file that changes on almost every user action.
      watch: process.env.DISABLE_HMR === 'true' ? null : { ignored: ['**/data.json'] },
    },
  };
});
