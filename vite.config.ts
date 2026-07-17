import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // NOTE: a forced "content-blog" manual chunk used to live here, but
          // Rollup's chunk-graph hoisting made the ENTRY statically import it,
          // shipping the 768KB blog corpus on every route. Without the rule the
          // corpus splits naturally into the lazy blog-page chunks only.
          if (id.includes("/src/data/faqData.")) {
            return "content-faq";
          }

          return undefined;
        },
      },
    },
  },
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
    },
  },
});
