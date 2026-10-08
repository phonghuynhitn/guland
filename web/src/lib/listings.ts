export type Listing = {
  id: string
  lat: number
  lng: number
  areaM2: number
  pricePerM2: number
  type: 'nha' | 'dat'
  title: string
  address: string
}

export type ListingsFile = {
  source: string
  listings: Listing[]
}

export const NEARBY_RADIUS_M = 500

export function formatVnd(n: number) {
  return Math.round(n).toLocaleString('vi-VN') + ' đ'
}

export function formatPricePerM2(n: number) {
  const trieu = n / 1_000_000
  const text = trieu >= 100 ? trieu.toFixed(0) : trieu.toFixed(1)
  return `${text} triệu/m²`
}

export function priceRange(listings: Listing[]) {
  if (listings.length === 0) return { min: 0, max: 1 }
  const prices = listings.map((l) => l.pricePerM2)
  return { min: Math.min(...prices), max: Math.max(...prices) }
}

/** Xanh (rẻ) -> vàng -> đỏ (đắt). */
export function priceColor(price: number, min: number, max: number) {
  const t = max <= min ? 0.5 : Math.min(1, Math.max(0, (price - min) / (max - min)))
  const stops: [number, number, number][] = [
    [34, 197, 94],
    [250, 204, 21],
    [239, 68, 68],
  ]
  const scaled = t * (stops.length - 1)
  const i = Math.min(stops.length - 2, Math.floor(scaled))
  const f = scaled - i
  const a = stops[i]
  const b = stops[i + 1]
  const rgb = a.map((c, k) => Math.round(c + (b[k] - c) * f))
  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`
}

export function markerRadius(areaM2: number) {
  return Math.min(14, Math.max(6, 5 + areaM2 / 40))
}

export function median(values: number[]) {
  if (values.length === 0) return 0
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

export function haversineM(lat1: number, lng1: number, lat2: number, lng2: number) {
  const r = 6371000
  const p1 = (lat1 * Math.PI) / 180
  const p2 = (lat2 * Math.PI) / 180
  const dp = ((lat2 - lat1) * Math.PI) / 180
  const dl = ((lng2 - lng1) * Math.PI) / 180
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2
  return 2 * r * Math.asin(Math.sqrt(a))
}

export function listingsWithin(listings: Listing[], lat: number, lng: number, radiusM = NEARBY_RADIUS_M) {
  return listings
    .map((item) => ({ item, distanceM: haversineM(lat, lng, item.lat, item.lng) }))
    .filter((x) => x.distanceM <= radiusM)
    .sort((a, b) => a.distanceM - b.distanceM)
}
