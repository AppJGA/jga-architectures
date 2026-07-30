import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'Logo_JGA_Archi.jpg',
        'icons/icon-16.png', 'icons/icon-32.png',
        'icons/icon-152.png', 'icons/icon-167.png', 'icons/icon-180.png',
        'icons/icon-192.png', 'icons/icon-512.png',
        'icons/icon-192-maskable.png', 'icons/icon-512-maskable.png',
      ],
      manifest: {
        name: 'JGA Espace Collaborateur',
        short_name: 'JGA',
        description: 'Espace collaborateur Jacques Gerbe & Associés Architectures',
        lang: 'fr',
        // Barre de titre de la fenêtre installée : l'encre de la charte.
        theme_color: '#1F1B17',
        background_color: '#FAF7F2',
        display: 'standalone',
        orientation: 'any',
        scope: '/',
        start_url: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          // Déclarées séparément : une icône « maskable » est rognée par le
          // système (cercle, carré arrondi…). Seules celles qui réservent une
          // marge de sécurité peuvent porter ce rôle — l'icône « any », cadrée
          // au plus juste, y perdrait ses bords.
          { src: '/icons/icon-192-maskable.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        globPatterns: ['**/*.{js,css,html,ico,png,svg,jpg}'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.hostname.includes('supabase.co'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-api',
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 },
            },
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
  },
})
