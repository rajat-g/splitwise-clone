import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // App ships its own manifest (public/manifest.webmanifest).
      manifest: false,
      registerType: 'autoUpdate',
      includeAssets: [
        'favicon.svg',
        'icons/*.png',
        'icons/*.svg',
        'manifest.webmanifest',
      ],
      workbox: {
        // SPA deep links (e.g. /g/:id) resolve offline to the cached shell;
        // the app then renders its own offline copy from localStorage.
        navigateFallback: 'index.html',
        // Convex API traffic is realtime + authenticated: never cache it.
        // Only precached build assets are served offline.
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
})
