export type SaleStatus = 'available' | 'holding' | 'deposited' | 'contract' | 'liquidated'
export type BaseLayer = 'satellite' | 'streets'

export type Lot = {
  id: string
  code: string
  x: number
  y: number
  zone: string
  block: string
  ring: [number, number][]
}

export type PlanMeta = {
  title: string
  frame: { width: number; height: number }
  overlay: { image: string; x: number; y: number; width: number; height: number }
  center: { lat: number; lng: number }
  metersPerPixel: number
  /** Degrees clockwise around the frame center. */
  rotation?: number
  /** Stretch across the lot rows, then along them. 1 leaves the drawing unchanged. */
  scaleAcross?: number
  scaleAlong?: number
  zones: string[]
}

export const STATUS_ORDER: SaleStatus[] = ['available', 'holding', 'deposited', 'contract', 'liquidated']

export const STATUS_META: Record<SaleStatus, { label: string; color: string }> = {
  available: { label: 'Còn trống', color: '#E0E0E0' },
  holding: { label: 'Đang giữ chỗ', color: '#8A8A8A' },
  deposited: { label: 'Đã đặt cọc', color: '#1A75D1' },
  contract: { label: 'Đã ký HĐCN', color: '#178B70' },
  liquidated: { label: 'Đã thanh lý', color: '#E58C00' },
}

const dataUrl = (file: string) => `${import.meta.env.BASE_URL}data/saban-demo/${file}`

export const META_URL = dataUrl('meta.json')
export const LOTS_URL = dataUrl('lots.json')
export const overlayUrl = (file: string) => dataUrl(file)

export function demoStatus(code: string): SaleStatus {
  let hash = 2166136261
  for (let i = 0; i < code.length; i++) {
    hash ^= code.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return STATUS_ORDER[(hash >>> 0) % STATUS_ORDER.length]
}

const ALONG = { x: 0.79109549, y: -0.61169267 }
const ACROSS = { x: -0.61169267, y: -0.79109549 }

export function frameToLatLng(meta: PlanMeta, x: number, y: number): [number, number] {
  const dx = x - meta.frame.width / 2
  const dy = y - meta.frame.height / 2
  const along = (dx * ALONG.x + dy * ALONG.y) * (meta.scaleAlong ?? 1)
  const across = (dx * ACROSS.x + dy * ACROSS.y) * (meta.scaleAcross ?? 1)
  const stretchedX = along * ALONG.x + across * ACROSS.x
  const stretchedY = along * ALONG.y + across * ACROSS.y
  let east = stretchedX * meta.metersPerPixel
  let south = stretchedY * meta.metersPerPixel
  const rotation = ((meta.rotation ?? 0) * Math.PI) / 180
  if (rotation) {
    const cos = Math.cos(rotation)
    const sin = Math.sin(rotation)
    const nextEast = east * cos - south * sin
    const nextSouth = east * sin + south * cos
    east = nextEast
    south = nextSouth
  }
  const lat = meta.center.lat - south / 111320
  const lng = meta.center.lng + east / (111320 * Math.cos((meta.center.lat * Math.PI) / 180))
  return [lat, lng]
}

export function khuOf(code: string) {
  return code.split('-')[0] || code
}

export function searchLots(lots: Lot[], raw: string) {
  const query = raw.trim().toLowerCase()
  if (!query) return []
  return lots.filter((lot) => lot.code.toLowerCase() === query)
}
