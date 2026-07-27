import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base: './' -> her statik hosting'de (kök ya da alt dizin) çalışır
export default defineConfig({
  plugins: [react()],
  base: './',
})
