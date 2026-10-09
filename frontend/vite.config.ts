import { resolve } from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

import { VitePWA } from "vite-plugin-pwa" //for PWA!!

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), VitePWA()],
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "./src"),
    },
  },
})

VitePWA({
  registerType: "prompt",
  manifest: {
    name: "Your Project",
    short_name: "YourApp",
    start_url: "/",
    display: "standalone",
    theme_color: "#ffffff",
    background_color: "#ffffff",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  },
})