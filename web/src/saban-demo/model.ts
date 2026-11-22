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
  /** Pixel box of each zone. Derived from the lots, not stored in meta.json. */
  anchors?: Record<string, ZoneAnchor>
  /** Extra placement on top of the project alignment, around each zone anchor. */
  zoneTweaks?: Record<string, ZoneTweak>
  /** Frame-pixel boundary drawn for a zone. The artwork inside follows that zone. */
  zoneOutlines?: Record<string, [number, number][]>
}

export type ZoneAnchor = {
  x: number
  y: number
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export type ZoneTweak = {
  east: number
  north: number
  scale: number
  rotation: number
  scaleAcross: number
  scaleAlong: number
}

export const STATUS_ORDER: SaleStatus[] = ['available', 'holding', 'deposited', 'contract', 'liquidated']

export const STATUS_META: Record<SaleStatus, { label: string; color: string }> = {
  available: { label: 'Còn trống', color: '#E0E0E0' },
  holding: { label: 'Đang giữ chỗ', color: '#8A8A8A' },
  deposited: { label: 'Đã đặt cọc', color: '#1A75D1' },
  contract: { label: 'Đã ký HĐCN', color: '#178B70' },
  liquidated: { label: 'Đã thanh lý', color: '#E58C00' },
}

/** Unfiltered lots stay drawn. Fill is a skin tone so the plan photo is not the lot. */
export const IDLE_LOT = { fill: '#C5B893', stroke: '#ffffff', ink: '#3d2914' }

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
const EARTH = 111320

export const IDENTITY_TWEAK: ZoneTweak = {
  east: 0,
  north: 0,
  scale: 1,
  rotation: 0,
  scaleAcross: 1,
  scaleAlong: 1,
}

export function identityTweak(tweak: ZoneTweak) {
  return (
    tweak.east === 0 &&
    tweak.north === 0 &&
    tweak.scale === 1 &&
    tweak.rotation === 0 &&
    tweak.scaleAcross === 1 &&
    tweak.scaleAlong === 1
  )
}

function ringArea(ring: [number, number][]) {
  let sum = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    sum += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1]
  }
  return Math.abs(sum) / 2
}

function lotCenter(lot: Lot): [number, number] {
  const closed =
    lot.ring.length > 1 &&
    lot.ring[0][0] === lot.ring[lot.ring.length - 1][0] &&
    lot.ring[0][1] === lot.ring[lot.ring.length - 1][1]
  const points = closed ? lot.ring.slice(0, -1) : lot.ring
  let area = 0
  let cx = 0
  let cy = 0
  for (let i = 0; i < points.length; i++) {
    const [x0, y0] = points[i]
    const [x1, y1] = points[(i + 1) % points.length]
    const cross = x0 * y1 - x1 * y0
    area += cross
    cx += (x0 + x1) * cross
    cy += (y0 + y1) * cross
  }
  if (Math.abs(area) < 1e-4) {
    const count = points.length || 1
    return [points.reduce((sum, point) => sum + point[0], 0) / count, points.reduce((sum, point) => sum + point[1], 0) / count]
  }
  return [cx / (3 * area), cy / (3 * area)]
}

export function pointInRing(x: number, y: number, ring: [number, number][]) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0]
    const yi = ring[i][1]
    const xj = ring[j][0]
    const yj = ring[j][1]
    if (yi === yj) {
      if (y === yi && x >= Math.min(xi, xj) && x <= Math.max(xi, xj)) return true
      continue
    }
    if (yi > y !== yj > y && x <= ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** A lot whose center lies in a drawn outline belongs to that zone. The tightest outline wins. */
export function placeLots(lots: Lot[], outlines: Record<string, [number, number][]> | undefined): Lot[] {
  const drawn = Object.entries(outlines ?? {}).filter((entry) => entry[1].length >= 3)
  if (drawn.length === 0) return lots
  const ranked = drawn
    .map(([name, ring]) => ({ name, ring, area: ringArea(ring) }))
    .sort((a, b) => a.area - b.area || a.name.localeCompare(b.name))
  let changed = false
  const next = lots.map((lot) => {
    const [x, y] = lotCenter(lot)
    const hit = ranked.find((item) => pointInRing(x, y, item.ring))
    if (!hit || hit.name === lot.zone) return lot
    changed = true
    return { ...lot, zone: hit.name }
  })
  return changed ? next : lots
}

export function anchorsOf(lots: Lot[], outlines?: Record<string, [number, number][]>): Record<string, ZoneAnchor> {
  const boxes: Record<string, ZoneAnchor> = {}
  const grow = (zone: string, x: number, y: number) => {
    if (!zone) return
    let box = boxes[zone]
    if (!box) {
      box = { x: 0, y: 0, minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
      boxes[zone] = box
    }
    if (x < box.minX) box.minX = x
    if (y < box.minY) box.minY = y
    if (x > box.maxX) box.maxX = x
    if (y > box.maxY) box.maxY = y
  }
  for (const lot of lots) {
    for (const [x, y] of lot.ring) grow(lot.zone, x, y)
  }
  for (const [zone, ring] of Object.entries(outlines ?? {})) {
    if (ring.length < 3) continue
    for (const [x, y] of ring) grow(zone, x, y)
  }
  for (const box of Object.values(boxes)) {
    box.x = (box.minX + box.maxX) / 2
    box.y = (box.minY + box.maxY) / 2
  }
  return boxes
}

function projectFrame(meta: PlanMeta, x: number, y: number): [number, number] {
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
  const lat = meta.center.lat - south / EARTH
  const lng = meta.center.lng + east / (EARTH * Math.cos((meta.center.lat * Math.PI) / 180))
  return [lat, lng]
}

function stretchAround(x: number, y: number, anchor: ZoneAnchor, tweak: ZoneTweak): [number, number] {
  const dx = x - anchor.x
  const dy = y - anchor.y
  const along = (dx * ALONG.x + dy * ALONG.y) * tweak.scaleAlong
  const across = (dx * ACROSS.x + dy * ACROSS.y) * tweak.scaleAcross
  return [anchor.x + along * ALONG.x + across * ACROSS.x, anchor.y + along * ALONG.y + across * ACROSS.y]
}

function shiftAround(meta: PlanMeta, pivot: [number, number], point: [number, number], tweak: ZoneTweak): [number, number] {
  const cosLat = Math.cos((meta.center.lat * Math.PI) / 180)
  let east = (point[1] - pivot[1]) * EARTH * cosLat
  let north = (point[0] - pivot[0]) * EARTH
  east *= tweak.scale
  north *= tweak.scale
  const rotation = (tweak.rotation * Math.PI) / 180
  if (rotation) {
    const cos = Math.cos(rotation)
    const sin = Math.sin(rotation)
    const nextEast = east * cos + north * sin
    const nextNorth = -east * sin + north * cos
    east = nextEast
    north = nextNorth
  }
  east += tweak.east
  north += tweak.north
  return [pivot[0] + north / EARTH, pivot[1] + east / (EARTH * cosLat)]
}

export function frameToLatLng(meta: PlanMeta, x: number, y: number, zone?: string): [number, number] {
  const tweak = zone ? meta.zoneTweaks?.[zone] : undefined
  const anchor = zone ? meta.anchors?.[zone] : undefined
  if (!tweak || !anchor || identityTweak(tweak)) return projectFrame(meta, x, y)
  const stretched =
    tweak.scaleAcross === 1 && tweak.scaleAlong === 1 ? ([x, y] as [number, number]) : stretchAround(x, y, anchor, tweak)
  const projected = projectFrame(meta, stretched[0], stretched[1])
  if (tweak.scale === 1 && tweak.rotation === 0 && tweak.east === 0 && tweak.north === 0) return projected
  return shiftAround(meta, projectFrame(meta, anchor.x, anchor.y), projected, tweak)
}

function unprojectFrame(meta: PlanMeta, lat: number, lng: number): [number, number] {
  const cosLat = Math.cos((meta.center.lat * Math.PI) / 180)
  let east = (lng - meta.center.lng) * EARTH * cosLat
  let south = (meta.center.lat - lat) * EARTH
  const rotation = ((meta.rotation ?? 0) * Math.PI) / 180
  if (rotation) {
    const cos = Math.cos(rotation)
    const sin = Math.sin(rotation)
    const nextEast = east * cos + south * sin
    const nextSouth = -east * sin + south * cos
    east = nextEast
    south = nextSouth
  }
  const stretchedX = east / meta.metersPerPixel
  const stretchedY = south / meta.metersPerPixel
  const along = (stretchedX * ALONG.x + stretchedY * ALONG.y) / (meta.scaleAlong ?? 1)
  const across = (stretchedX * ACROSS.x + stretchedY * ACROSS.y) / (meta.scaleAcross ?? 1)
  return [meta.frame.width / 2 + along * ALONG.x + across * ACROSS.x, meta.frame.height / 2 + along * ALONG.y + across * ACROSS.y]
}

function unstretchAround(x: number, y: number, anchor: ZoneAnchor, tweak: ZoneTweak): [number, number] {
  const dx = x - anchor.x
  const dy = y - anchor.y
  const along = (dx * ALONG.x + dy * ALONG.y) / tweak.scaleAlong
  const across = (dx * ACROSS.x + dy * ACROSS.y) / tweak.scaleAcross
  return [anchor.x + along * ALONG.x + across * ACROSS.x, anchor.y + along * ALONG.y + across * ACROSS.y]
}

function unshiftAround(meta: PlanMeta, pivot: [number, number], point: [number, number], tweak: ZoneTweak): [number, number] {
  const cosLat = Math.cos((meta.center.lat * Math.PI) / 180)
  let east = (point[1] - pivot[1]) * EARTH * cosLat - tweak.east
  let north = (point[0] - pivot[0]) * EARTH - tweak.north
  const rotation = (tweak.rotation * Math.PI) / 180
  if (rotation) {
    const cos = Math.cos(rotation)
    const sin = Math.sin(rotation)
    const nextEast = east * cos - north * sin
    const nextNorth = east * sin + north * cos
    east = nextEast
    north = nextNorth
  }
  return [pivot[0] + north / tweak.scale / EARTH, pivot[1] + east / tweak.scale / (EARTH * cosLat)]
}

export function latLngToFrame(meta: PlanMeta, lat: number, lng: number, zone?: string): [number, number] {
  const tweak = zone ? meta.zoneTweaks?.[zone] : undefined
  const anchor = zone ? meta.anchors?.[zone] : undefined
  let lat0 = lat
  let lng0 = lng
  if (tweak && anchor && !identityTweak(tweak) && !(tweak.scale === 1 && tweak.rotation === 0 && tweak.east === 0 && tweak.north === 0)) {
    const undone = unshiftAround(meta, projectFrame(meta, anchor.x, anchor.y), [lat, lng], tweak)
    lat0 = undone[0]
    lng0 = undone[1]
  }
  const pixel = unprojectFrame(meta, lat0, lng0)
  if (!tweak || !anchor || identityTweak(tweak) || (tweak.scaleAcross === 1 && tweak.scaleAlong === 1)) return pixel
  return unstretchAround(pixel[0], pixel[1], anchor, tweak)
}

export function khuOf(code: string) {
  return code.split('-')[0] || code
}

export function searchLots(lots: Lot[], raw: string) {
  const query = raw.trim().toLowerCase()
  if (!query) return []
  return lots.filter((lot) => lot.code.toLowerCase() === query)
}
