import type { PMTiles } from 'pmtiles'
import { getTileBlob } from './pmtilesLayer'

export type LegendItem = {
  code: string
  name: string
  color: string
  group: string
}

const TILE_SIZE = 256
const SAMPLE_RADIUS = 3
const MAX_COLOR_DISTANCE = 30

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function colorDistance(a: [number, number, number], b: [number, number, number]) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
}

function lngLatToTilePixel(lat: number, lng: number, z: number) {
  const scale = TILE_SIZE * 2 ** z
  const px = ((lng + 180) / 360) * scale
  const sin = Math.sin((lat * Math.PI) / 180)
  const py = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale
  return {
    x: Math.floor(px / TILE_SIZE),
    y: Math.floor(py / TILE_SIZE),
    px: Math.floor(px % TILE_SIZE),
    py: Math.floor(py % TILE_SIZE),
  }
}

/**
 * Đoán loại đất bằng màu ảnh quy hoạch quanh điểm click. Nhiều mã đất dùng chung một màu
 * nên kết quả có thể là một nhóm mã; chữ và đường kẻ trên ảnh được loại bỏ nhờ lấy màu phổ biến nhất.
 */
export async function sampleLandUse(
  archive: PMTiles,
  legend: LegendItem[],
  lat: number,
  lng: number,
): Promise<LegendItem[] | null> {
  const header = await archive.getHeader()
  const legendRgb = legend.map((item) => ({ item, rgb: hexToRgb(item.color) }))

  // Ô zoom cao có thể bị GDAL bỏ (trong suốt). Hạ dần zoom đến khi lấy được màu.
  for (let z = header.maxZoom; z >= header.minZoom; z--) {
    const t = lngLatToTilePixel(lat, lng, z)
    const blob = await getTileBlob(archive, z, t.x, t.y)
    if (!blob) continue

    const bitmap = await createImageBitmap(blob)
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
    const ctx = canvas.getContext('2d')
    if (!ctx) continue
    ctx.drawImage(bitmap, 0, 0)

    const x0 = Math.max(0, t.px - SAMPLE_RADIUS)
    const y0 = Math.max(0, t.py - SAMPLE_RADIUS)
    const size = SAMPLE_RADIUS * 2 + 1
    const { data } = ctx.getImageData(x0, y0, size, size)

    const votes = new Map<string, number>()
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 128) continue
      const rgb: [number, number, number] = [data[i], data[i + 1], data[i + 2]]
      let best: { color: string; d: number } | null = null
      for (const { item, rgb: ref } of legendRgb) {
        const d = colorDistance(rgb, ref)
        if (d <= MAX_COLOR_DISTANCE && (!best || d < best.d)) best = { color: item.color, d }
      }
      if (best) votes.set(best.color, (votes.get(best.color) ?? 0) + 1)
    }

    const winner = [...votes.entries()].sort((a, b) => b[1] - a[1])[0]
    if (winner) return legend.filter((item) => item.color === winner[0])
  }
  return null
}

export type LandUseShare = {
  color: string
  items: LegendItem[]
  count: number
  percent: number
}

/** Ước lượng tỷ lệ loại đất bằng cách lấy mẫu nhiều điểm trong thửa (không phải giao vector). */
export async function sampleLandUseMix(
  archive: PMTiles,
  legend: LegendItem[],
  points: { lat: number; lng: number }[],
): Promise<LandUseShare[]> {
  const tally = new Map<string, number>()
  for (const p of points) {
    const hit = await sampleLandUse(archive, legend, p.lat, p.lng)
    if (!hit || hit.length === 0) continue
    const color = hit[0].color
    tally.set(color, (tally.get(color) ?? 0) + 1)
  }
  const total = [...tally.values()].reduce((s, n) => s + n, 0)
  if (!total) return []
  return [...tally.entries()]
    .map(([color, count]) => ({
      color,
      items: legend.filter((i) => i.color === color),
      count,
      percent: (count / total) * 100,
    }))
    .sort((a, b) => b.percent - a.percent)
}
