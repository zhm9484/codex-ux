import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  base: '/apps/video-editor/',
  build: {
    outDir: '../../.agents/skills/video-editor/dist',
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
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true },
});
