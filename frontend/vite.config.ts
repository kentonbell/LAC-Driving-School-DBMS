import { resolve } from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { VitePWA } from "vite-plugin-pwa"

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "L.A.C. Driving School",
        short_name: "L.A.C. Driving",
        start_url: "/",
        display: "standalone",
        theme_color: "#183e34",
        background_color: "#f8f5e9",
        icons: [192, 512].map((n) => ({
          src: "/brand/icon-" + n + ".png",
          sizes: n + "x" + n,
          type: "image/png",
        })),
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,jpg,woff2}"],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
    }),
  ],
  resolve: { alias: { "@": resolve(import.meta.dirname, "./src") } },
})
