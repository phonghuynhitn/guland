import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const root = fileURLToPath(new URL('.', import.meta.url))

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
    rollupOptions: {
      input: {
        main: resolve(root, 'index.html'),
        saban: resolve(root, 'sa-ban/index.html'),
        saban2: resolve(root, 'sa-ban-2/index.html'),
        cadViewer: resolve(root, 'cad-viewer/index.html'),
      },
    },
  },
})
