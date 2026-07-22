import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: null,
      devOptions: {
        enabled: true,
        type: "module",
      },
      manifest: {
        name: "POS",
        short_name: "POS",
        description: "Point of sale, inventory, and back-office management.",
        theme_color: "#0a0a0a",
        background_color: "#0a0a0a",
        display: "standalone",
        icons: [{ src: "/pwa-icon.svg", sizes: "any", type: "image/svg+xml" }],
      },
      workbox: {
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            // Product/category catalog reads — cached so the POS terminal can
            // keep browsing and charging sales through a connectivity drop.
            urlPattern: ({ url }) =>
              url.pathname.startsWith("/api/products") || url.pathname.startsWith("/api/categories"),
            handler: "NetworkFirst",
            options: {
              cacheName: "pos-catalog-cache",
              networkTimeoutSeconds: 3,
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ""),
      },
    },
  },
});
