/**
 * Georeference PA2 lot polygons (plan CRS from DWG export) onto WGS84 using
 * four ground-control corners on the satellite map.
 *
 * Source geometry: public/data/saban2/lots.geojson (241108 Bd SDD-PhanLo MBH PA2).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import booleanPointInPolygon from '@turf/boolean-point-in-polygon'
import { point } from '@turf/helpers'

const root = path.dirname(fileURLToPath(new URL('.', import.meta.url)))

const SRC = path.join(root, 'public/data/saban2/lots.geojson')
const OUT_DIR = path.join(root, 'public/data/tdl-scale-model')
const OUT = path.join(OUT_DIR, 'lots-wgs84.geojson')

/** WGS84 corners of the project site (same order as TdlScaleModelPage). */
const WGS_CORNERS = [
  [10.74591525111054, 106.47371532999577],
  [10.74122460678323, 106.47720484696936],
  [10.732285979256245, 106.45546481528693],
  [10.727642559336095, 106.45914456105865],
]

const PIN = [10.737477079512168, 106.46676936659878]

function ringAroundLatLng(points) {
  const lat = points.reduce((sum, point) => sum + point[0], 0) / points.length
  const lng = points.reduce((sum, point) => sum + point[1], 0) / points.length
  return [...points].sort(
    (a, b) => Math.atan2(a[0] - lat, a[1] - lng) - Math.atan2(b[0] - lat, b[1] - lng),
  )
}

function ringAroundPlan(points) {
  const x = points.reduce((sum, point) => sum + point[0], 0) / points.length
  const y = points.reduce((sum, point) => sum + point[1], 0) / points.length
  return [...points].sort(
    (a, b) => Math.atan2(a[1] - y, a[0] - x) - Math.atan2(b[1] - y, b[0] - x),
  )
}

function bboxCorners(points) {
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const [x, y] of points) {
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
    minY = Math.min(minY, y)
    maxY = Math.max(maxY, y)
  }
  return [
    [minX, minY],
    [maxX, minY],
    [maxX, maxY],
    [minX, maxY],
  ]
}

function controlError(latCoef, lngCoef, pairs) {
  return pairs.reduce((sum, { plan, wgs }) => {
    const lat = applyAffine(latCoef, plan[0], plan[1])
    const lng = applyAffine(lngCoef, plan[0], plan[1])
    const dLat = lat - wgs[0]
    const dLng = lng - wgs[1]
    return sum + dLat * dLat + dLng * dLng
  }, 0)
}

function pickTransform(vertices, fc) {
  const base = ringAroundPlan(bboxCorners(vertices))
  const wgs = ringAroundLatLng(WGS_CORNERS)
  let best = null

  const variants = []
  for (let rot = 0; rot < 4; rot += 1) {
    variants.push([...base.slice(rot), ...base.slice(0, rot)])
    variants.push([...base.slice(rot), ...base.slice(0, rot)].reverse())
  }

  for (const planCorners of variants) {
    const pairs = planCorners.map((plan, i) => ({ plan, wgs: wgs[i] }))
    const latCoef = fitAffine(pairs, 0)
    const lngCoef = fitAffine(pairs, 1)
    const err = controlError(latCoef, lngCoef, pairs)
    const pinOk = (() => {
      const probe = point([PIN[1], PIN[0]])
      return fc.features.some((feature) => {
        if (!feature.properties?.closed || feature.geometry?.type !== 'Polygon') return false
        const ring = transformRing(feature.geometry.coordinates[0], latCoef, lngCoef)
        return booleanPointInPolygon(probe, {
          type: 'Feature',
          properties: {},
          geometry: { type: 'Polygon', coordinates: [ring] },
        })
      })
    })()
    const score = err + (pinOk ? 0 : 1e6)
    if (!best || score < best.score) {
      best = { latCoef, lngCoef, pairs, err, pinOk, score }
    }
  }

  return best
}

function fitAffine(pairs, valueIndex) {
  // valueIndex 0 = lat, 1 = lng from [lat, lng]
  let n = 0
  let sxx = 0
  let syy = 0
  let sxy = 0
  let sx = 0
  let sy = 0
  let sv = 0
  let svx = 0
  let svy = 0

  for (const { plan, wgs } of pairs) {
    const [x, y] = plan
    const v = wgs[valueIndex]
    n += 1
    sxx += x * x
    syy += y * y
    sxy += x * y
    sx += x
    sy += y
    sv += v
    svx += x * v
    svy += y * v
  }

  const m = [
    [n, sx, sy],
    [sx, sxx, sxy],
    [sy, sxy, syy],
  ]
  const b = [sv, svx, svy]
  return solve3(m, b)
}

function solve3(m, b) {
  const a = m.map((row, i) => [...row, b[i]])
  for (let col = 0; col < 3; col += 1) {
    let pivot = col
    for (let row = col + 1; row < 3; row += 1) {
      if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row
    }
    ;[a[col], a[pivot]] = [a[pivot], a[col]]
    const div = a[col][col] || 1e-12
    for (let row = col; row < 4; row += 1) a[col][row] /= div
    for (let row = 0; row < 3; row += 1) {
      if (row === col) continue
      const factor = a[row][col]
      for (let c = col; c < 4; c += 1) a[row][c] -= factor * a[col][c]
    }
  }
  return [a[0][3], a[1][3], a[2][3]]
}

function applyAffine([c0, c1, c2], x, y) {
  return c0 + c1 * x + c2 * y
}

function transformRing(ring, latCoef, lngCoef) {
  return ring.map(([x, y]) => [applyAffine(lngCoef, x, y), applyAffine(latCoef, x, y)])
}

function main() {
  const fc = JSON.parse(fs.readFileSync(SRC, 'utf8'))
  const vertices = []
  for (const feature of fc.features) {
    if (!feature.properties?.closed || feature.geometry?.type !== 'Polygon') continue
    for (const [x, y] of feature.geometry.coordinates[0]) vertices.push([x, y])
  }

  const fit = pickTransform(vertices, fc)
  if (!fit) throw new Error('Could not fit plan-to-WGS transform')
  const { latCoef, lngCoef, pairs } = fit

  const features = []
  for (const feature of fc.features) {
    if (!feature.properties?.closed || feature.geometry?.type !== 'Polygon') continue
    const ring = feature.geometry.coordinates[0]
    const outRing = transformRing(ring, latCoef, lngCoef)
    if (outRing.length > 1) {
      const [firstLng, firstLat] = outRing[0]
      const [lastLng, lastLat] = outRing[outRing.length - 1]
      if (firstLng !== lastLng || firstLat !== lastLat) outRing.push([firstLng, firstLat])
    }
    features.push({
      type: 'Feature',
      properties: { ...feature.properties },
      geometry: { type: 'Polygon', coordinates: [outRing] },
    })
  }

  const pinInside = fit.pinOk

  fs.mkdirSync(OUT_DIR, { recursive: true })
  fs.writeFileSync(
    OUT,
    JSON.stringify({
      type: 'FeatureCollection',
      properties: {
        sourceDwg: '241108 Bd SDD-PhanLo MBH(DieuChinhTĐC-PA2).dwg',
        control: { plan: pairs.map((p) => p.plan), wgs: pairs.map((p) => p.wgs), error: fit.err },
        pinInside,
      },
      features,
    }),
  )

  console.log(`Wrote ${features.length} features to ${OUT}`)
  console.log('PIN inside a lot:', pinInside)
  console.log('Control pairs:')
  pairs.forEach((pair, i) => {
    const lat = applyAffine(latCoef, pair.plan[0], pair.plan[1])
    const lng = applyAffine(lngCoef, pair.plan[0], pair.plan[1])
    console.log(
      `  ${i + 1} plan [${pair.plan.map((n) => n.toFixed(2))}] -> fit [${lat.toFixed(6)}, ${lng.toFixed(6)}] target [${pair.wgs.join(', ')}]`,
    )
  })
}

main()