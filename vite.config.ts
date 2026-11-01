import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const packageMetadata = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as {
  version: string;
};
const appCommit = process.env.GITHUB_SHA?.slice(0, 7) ?? execFileSync("git", ["rev-parse", "--short=7", "HEAD"], { encoding: "utf8" }).trim();

export default defineConfig(({ command }) => ({
  define: {
    __APP_VERSION__: JSON.stringify(packageMetadata.version),
    __APP_COMMIT__: JSON.stringify(appCommit),
  },
  root: "web",
  base: command === "build" ? "/Watercolorist/" : "/",
  plugins: [
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: [
        "favicon.ico",
        "watercolorist.svg",
        "apple-touch-icon-180x180.png",
      ],
      manifest: {
        name: "Watercolorist",
        short_name: "Watercolorist",
        description: "Create value and color studies for watercolor painting.",
        theme_color: "#f6f4ee",
        background_color: "#f6f4ee",
        display: "standalone",
        scope: "./",
        start_url: "./",
        icons: [
          {
            src: "pwa-64x64.png",
            sizes: "64x64",
            type: "image/png",
          },
          {
            src: "pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "maskable-icon-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{html,js,css,svg,ico,png,woff2}"],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/pyodide\/v314\.0\.7\/full\//,
            handler: "CacheFirst",
            options: {
              cacheName: "watercolorist-pyodide-v314",
              cacheableResponse: { statuses: [200] },
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
    }),
  ],
  server: {
    host: "127.0.0.1",
  },
  build: {
    outDir: "../dist",
    emptyOutDir: true,
  },
}));
