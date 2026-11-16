import { copyFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(fileURLToPath(import.meta.url), '..', '..')

const copies = [
  {
    from: path.join(
      root,
      'node_modules/@mlightcad/libredwg-converter/dist/libredwg-parser-worker.js',
    ),
    to: path.join(root, 'public/workers/libredwg-parser-worker.js'),
  },
  {
    from: path.join(
      root,
      'node_modules/@mlightcad/libredwg-converter/dist/libredwg-web.wasm',
    ),
    to: path.join(root, 'public/workers/libredwg-web.wasm'),
  },
  {
    from: path.join(
      root,
      'node_modules/@mlightcad/mtext-renderer/dist/mtext-renderer-worker.js',
    ),
    to: path.join(root, 'public/workers/mtext-renderer-worker.js'),
  },
]

async function main() {
  await mkdir(path.join(root, 'public/workers'), { recursive: true })
  for (const { from, to } of copies) {
    await copyFile(from, to)
  }
  console.log('[copy-mlight-workers] synced', copies.length, 'worker assets to public/workers/')
}

main().catch((err) => {
  console.error('[copy-mlight-workers] failed:', err)
  process.exit(1)
})