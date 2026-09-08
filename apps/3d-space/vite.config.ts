import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Native modules give the editor and arbitrary agent modules the same Three.js instance.
const runtimeImport = (id: string) =>
  id === 'three'
    ? '/media/3d-space/engine/build/three.module.js'
    : id.startsWith('three/addons/')
      ? id.replace('three/addons/', '/media/3d-space/engine/addons/')
      : null;
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'shared-scene-runtime',
      enforce: 'pre',
      transformIndexHtml: {
        order: 'pre',
        handler(html, context) {
          // Vite prefixes external root paths with the app base in development.
          // Match that URL in the import map so user code shares exactly the same module.
          return context.server
            ? html.replaceAll('"/media/3d-space/engine/', '"/apps/3d-space/media/3d-space/engine/')
            : html;
        },
      },
      resolveId(id) {
        const path = runtimeImport(id);
        return path ? { id: path, external: true } : null;
      },
    },
  ],
  base: '/apps/3d-space/',
  optimizeDeps: { exclude: ['three'] },
  server: { preTransformRequests: false },
  build: { outDir: '../../skills/codex-ux-3d-space/dist', emptyOutDir: true },
});
