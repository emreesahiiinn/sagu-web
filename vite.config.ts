import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base: './' -> her statik hosting'de (kök ya da alt dizin) çalışır
export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    /* Formu yerelde denerken: bir terminalde `npm run dev:worker` (API'yi 8788'de
       ayağa kaldırır), diğerinde `npm run dev` (HMR'li site).
       Vite dev sunucusunda /api yolu yoktur; buradan Worker'a devredilir. */
    proxy: {
      '/api': { target: 'http://127.0.0.1:8788', changeOrigin: true },
    },
  },
})
