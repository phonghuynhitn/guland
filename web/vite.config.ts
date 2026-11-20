import react from '@vitejs/plugin-react'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'
import { defineConfig } from 'vite'

function sabanAlignSave(root: string): Plugin {
  const file = resolve(root, 'public/data/saban-demo/meta.json')
  return {
    name: 'saban-align-save',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split('?')[0]
        if (url !== '/api/saban-demo-align' || req.method !== 'POST') {
          next()
          return
        }
        const chunks: Buffer[] = []
        req.on('data', (chunk: Buffer) => chunks.push(chunk))
        req.on('end', () => {
          try {
            const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
              center?: { lat?: number; lng?: number }
              metersPerPixel?: number
              rotation?: number
              scaleAcross?: number
              scaleAlong?: number
            }
            const lat = body.center?.lat
            const lng = body.center?.lng
            const metersPerPixel = body.metersPerPixel
            const rotation = body.rotation ?? 0
            const scaleAcross = body.scaleAcross ?? 1
            const scaleAlong = body.scaleAlong ?? 1
            const numbers = [lat, lng, metersPerPixel, rotation, scaleAcross, scaleAlong]
            const valid =
              numbers.every((value) => Number.isFinite(value)) &&
              metersPerPixel! > 0.3 &&
              metersPerPixel! < 20 &&
              Math.abs(rotation) <= 20 &&
              scaleAcross > 0.5 &&
              scaleAcross < 2 &&
              scaleAlong > 0.5 &&
              scaleAlong < 2
            if (!valid) {
              res.statusCode = 400
              res.end('invalid')
              return
            }
            const meta = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>
            meta.center = { lat, lng }
            meta.metersPerPixel = metersPerPixel
            meta.rotation = rotation
            meta.scaleAcross = scaleAcross
            meta.scaleAlong = scaleAlong
            writeFileSync(file, `${JSON.stringify(meta, null, 2)}\n`)
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify({ ok: true }))
          } catch {
            res.statusCode = 500
            res.end('failed')
          }
        })
      })
    },
  }
}

const root = fileURLToPath(new URL('.', import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), sabanAlignSave(root)],
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
        sabanDemo: resolve(root, 'sa-ban-demo/index.html'),
        cadViewer: resolve(root, 'cad-viewer/index.html'),
      },
    },
  },
})
