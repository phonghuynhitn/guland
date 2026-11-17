import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pkgDir = path.join(root, 'node_modules', '@cadview', 'core', 'dist')

const noopFn = `function renderMeasureOverlay(_ctx, _vt, _measureTool, _mouseScreenX, _mouseScreenY, _theme) {
  return;
}
`

function noopRenderMeasureOverlay(src) {
  const start = src.indexOf('function renderMeasureOverlay(')
  const end = src.indexOf('function drawSnapIndicator(')
  if (start === -1 || end === -1 || end <= start) return null
  return src.slice(0, start) + noopFn + '\n' + src.slice(end)
}

for (const fileName of ['index.js', 'index.cjs']) {
  const filePath = path.join(pkgDir, fileName)
  if (!fs.existsSync(filePath)) continue
  const src = fs.readFileSync(filePath, 'utf8')
  const next = noopRenderMeasureOverlay(src)
  if (!next) {
    console.warn(`[patch-cadview-measure] could not locate renderMeasureOverlay in ${fileName}`)
    continue
  }
  fs.writeFileSync(filePath, next)
  console.log(`[patch-cadview-measure] disabled canvas measure overlay in ${fileName}`)
}