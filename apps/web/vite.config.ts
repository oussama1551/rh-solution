import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
        configure: proxy => {
          proxy.on("proxyReq", proxyReq => {
            proxyReq.removeHeader("if-none-match");
            proxyReq.removeHeader("if-modified-since");
            proxyReq.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
            proxyReq.setHeader("Pragma", "no-cache");
          });
          proxy.on("proxyRes", proxyRes => {
            delete proxyRes.headers.etag;
            proxyRes.headers["cache-control"] = "no-store, no-cache, must-revalidate, proxy-revalidate";
            proxyRes.headers.pragma = "no-cache";
            proxyRes.headers.expires = "0";
          });
        }
      }
    }
  }
});
