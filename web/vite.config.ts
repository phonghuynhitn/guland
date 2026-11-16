import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE ?? '/',
  assetsInclude: ['**/*.wasm'],
  optimizeDeps: {
    include: ['@mlightcad/cad-simple-viewer', '@mlightcad/libredwg-converter'],
  },
  build: {
    // @mlightcad/cad-viewer ships Vue v-bind() in media queries; lightningcss rejects them.
    cssMinify: 'esbuild',
  },
})
