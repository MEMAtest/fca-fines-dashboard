import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (
              id.includes('/react/')
              || id.includes('/react-dom/')
              || id.includes('/react-router-dom/')
              || id.includes('@vercel/analytics')
            ) {
              return 'vendor-react';
            }

            if (id.includes('/recharts/')) {
              return 'vendor-charts';
            }

            if (id.includes('/xlsx/')) {
              return 'vendor-export-xlsx';
            }

            if (
              id.includes('/html2canvas/')
              || id.includes('/dom-to-image/')
            ) {
              return 'vendor-export-capture';
            }

            if (id.includes('/papaparse/')) {
              return 'vendor-export-parse';
            }

            if (
              id.includes('/framer-motion/')
              || id.includes('/lucide-react/')
            ) {
              return 'vendor-ui';
            }
          }

          if (id.includes('/src/data/blogArticles.')) {
            return 'content-blog';
          }

          if (id.includes('/src/data/faqData.')) {
            return 'content-faq';
          }

          return undefined;
        },
      },
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
});
