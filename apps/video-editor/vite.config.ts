import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  base: '/apps/video-editor/',
  build: {
    outDir: '../../skills/codex-ux-video-editor/dist',
    emptyOutDir: true,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'html-parser', test: /node_modules\/(parse5|entities)\// },
            { name: 'react', test: /node_modules\/(react|react-dom|scheduler)\// },
          ],
        },
      },
    },
  },
  server: { host: '127.0.0.1', port: 0 },
  preview: { host: '127.0.0.1', port: 0 },
});
