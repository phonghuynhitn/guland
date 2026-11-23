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
              zoneTweaks?: Record<string, {
                east?: number
                north?: number
                scale?: number
                rotation?: number
                scaleAcross?: number
                scaleAlong?: number
              }>
              zoneOutlines?: Record<string, unknown>
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
            const meta = JSON.parse(readFileSync(file, 'utf8')) as { zones?: string[] } & Record<string, unknown>
            const names = new Set(meta.zones ?? [])
            const zoneTweaks: Record<string, { east: number; north: number; scale: number; rotation: number; scaleAcross: number; scaleAlong: number }> = {}
            for (const [name, tweak] of Object.entries(body.zoneTweaks ?? {})) {
              if (!names.has(name) || !tweak) {
                res.statusCode = 400
                res.end('invalid')
                return
              }
              const east = tweak.east ?? 0
              const north = tweak.north ?? 0
              const scale = tweak.scale ?? 1
              const zoneRotation = tweak.rotation ?? 0
              const zoneAcross = tweak.scaleAcross ?? 1
              const zoneAlong = tweak.scaleAlong ?? 1
              const zoneNumbers = [east, north, scale, zoneRotation, zoneAcross, zoneAlong]
              const zoneValid =
                zoneNumbers.every((value) => Number.isFinite(value)) &&
                Math.abs(east) <= 2000 &&
                Math.abs(north) <= 2000 &&
                scale >= 0.5 &&
                scale <= 2 &&
                Math.abs(zoneRotation) <= 30 &&
                zoneAcross >= 0.5 &&
                zoneAcross <= 2 &&
                zoneAlong >= 0.5 &&
                zoneAlong <= 2
              if (!zoneValid) {
                res.statusCode = 400
                res.end('invalid')
                return
              }
              zoneTweaks[name] = { east, north, scale, rotation: zoneRotation, scaleAcross: zoneAcross, scaleAlong: zoneAlong }
            }
            const zoneOutlines: Record<string, [number, number][]> = {}
            if (body.zoneOutlines != null && (typeof body.zoneOutlines !== 'object' || Array.isArray(body.zoneOutlines))) {
              res.statusCode = 400
              res.end('invalid')
              return
            }
            for (const [name, ring] of Object.entries(body.zoneOutlines ?? {})) {
              if (!names.has(name) || !Array.isArray(ring) || ring.length < 3 || ring.length > 400) {
                res.statusCode = 400
                res.end('invalid')
                return
              }
              const points: [number, number][] = []
              for (const point of ring) {
                if (!Array.isArray(point) || point.length < 2) {
                  res.statusCode = 400
                  res.end('invalid')
                  return
                }
                const px = Number(point[0])
                const py = Number(point[1])
                if (!Number.isFinite(px) || !Number.isFinite(py) || Math.abs(px) > 20000 || Math.abs(py) > 20000) {
                  res.statusCode = 400
                  res.end('invalid')
                  return
                }
                points.push([px, py])
              }
              zoneOutlines[name] = points
            }
            meta.center = { lat, lng }
            meta.metersPerPixel = metersPerPixel
            meta.rotation = rotation
            meta.scaleAcross = scaleAcross
            meta.scaleAlong = scaleAlong
            meta.zoneTweaks = zoneTweaks
            meta.zoneOutlines = zoneOutlines
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
