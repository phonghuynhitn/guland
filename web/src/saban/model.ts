import type { Feature, FeatureCollection, Polygon } from 'geojson'

export type SaleStatus = 'available' | 'holding' | 'deposited' | 'sold'
export type ZoneId = 'park' | 'river'
export type ColorMode = 'product' | 'status'

export type LotProps = {
  id: string
  zone: ZoneId
  row: number
  index: number
  product: string
  variant: 'corner' | 'typical'
  swatch: string
  frontageM: number
  depthM: number
  sizeLabel: string
  areaM2: number
  color: string
}

export type LotFeature = Feature<Polygon, LotProps>

export type PlanMeta = {
  width: number
  height: number
  image: string
  title: string
  splitX: number
  lots: number
}

export type Swatch = {
  id: string
  product: string
  productLabel: string
  variant: 'corner' | 'typical'
  variantLabel: string
  color: string
  sizeLabel: string
}

export const SWATCHES: Swatch[] = [
  { id: 'villa-detach-corner', product: 'villa-detach', productLabel: 'Biệt thự đơn lập', variant: 'corner', variantLabel: 'Góc / xen kẹt', color: '#9F6327', sizeLabel: '10,5 × 18 m' },
  { id: 'villa-detach-typical', product: 'villa-detach', productLabel: 'Biệt thự đơn lập', variant: 'typical', variantLabel: 'Điển hình', color: '#BD9C6F', sizeLabel: '10 × 18 m' },
  { id: 'villa-semi-corner', product: 'villa-semi', productLabel: 'Biệt thự song lập', variant: 'corner', variantLabel: 'Góc / xen kẹt', color: '#AB4E25', sizeLabel: '9,5–12 × 20 m' },
  { id: 'villa-semi-typical', product: 'villa-semi', productLabel: 'Biệt thự song lập', variant: 'typical', variantLabel: 'Điển hình', color: '#DF946C', sizeLabel: '8 × 20 m' },
  { id: 'townhouse-corner', product: 'townhouse', productLabel: 'Townhouse', variant: 'corner', variantLabel: 'Góc / xen kẹt', color: '#567D70', sizeLabel: '7–9 × 18 m' },
  { id: 'townhouse-typical', product: 'townhouse', productLabel: 'Townhouse', variant: 'typical', variantLabel: 'Điển hình', color: '#B1B7B5', sizeLabel: '5 × 18 m' },
  { id: 'shophouse-corner', product: 'shophouse', productLabel: 'Shophouse', variant: 'corner', variantLabel: 'Góc / xen kẹt', color: '#A07958', sizeLabel: '6–9 × 22 m' },
  { id: 'shophouse-typical', product: 'shophouse', productLabel: 'Shophouse', variant: 'typical', variantLabel: 'Điển hình', color: '#EAD9CF', sizeLabel: '5 × 22 m' },
]

export const PRODUCT_ORDER = ['villa-detach', 'villa-semi', 'townhouse', 'shophouse'] as const

export const STATUS_META: Record<SaleStatus, { label: string; color: string }> = {
  available: { label: 'Còn hàng', color: '#16a34a' },
  holding: { label: 'Giữ chỗ', color: '#ca8a04' },
  deposited: { label: 'Đã cọc', color: '#ea580c' },
  sold: { label: 'Đã bán', color: '#64748b' },
}

export const STATUS_ORDER: SaleStatus[] = ['available', 'holding', 'deposited', 'sold']

const STATUS_KEY = 'dragon-saban-status-v1'

const dataUrl = (file: string) => `${import.meta.env.BASE_URL}data/${file}`

export const META_URL = dataUrl('dragon-meta.json')
export const LOTS_URL = dataUrl('dragon-lots.geojson')
export const planImageUrl = (file: string) => dataUrl(file)

export function swatchOf(id: string) {
  return SWATCHES.find((item) => item.id === id) ?? SWATCHES[5]
}

export function zoneName(zone: ZoneId) {
  return zone === 'park' ? 'Dragon Park' : 'Dragon River'
}

export function lotBounds(lot: LotFeature): [[number, number], [number, number]] {
  let west = Infinity
  let east = -Infinity
  let south = Infinity
  let north = -Infinity
  for (const [x, y] of lot.geometry.coordinates[0]) {
    west = Math.min(west, x)
    east = Math.max(east, x)
    south = Math.min(south, y)
    north = Math.max(north, y)
  }
  return [
    [south, west],
    [north, east],
  ]
}

export function viewBounds(meta: PlanMeta, zone: 'all' | ZoneId): [[number, number], [number, number]] {
  if (zone === 'park') return [[0, 0], [meta.height, meta.splitX]]
  if (zone === 'river') return [[0, meta.splitX], [meta.height, meta.width]]
  return [[0, 0], [meta.height, meta.width]]
}

export function loadStatuses(): Record<string, SaleStatus> {
  try {
    const raw = localStorage.getItem(STATUS_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, SaleStatus>
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export function saveStatuses(statuses: Record<string, SaleStatus>) {
  localStorage.setItem(STATUS_KEY, JSON.stringify(statuses))
}

export function lotStatus(statuses: Record<string, SaleStatus>, id: string): SaleStatus {
  return statuses[id] ?? 'available'
}

type QueryParts = { letters: string; nums: number[] }

export function queryParts(raw: string): QueryParts {
  const plain = raw.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')
  return {
    letters: (plain.match(/[a-z]+/g) ?? []).join(''),
    nums: (plain.match(/\d+/g) ?? []).map(Number),
  }
}

export function matchScore(lot: LotProps, query: QueryParts): number {
  if (!query.letters && query.nums.length === 0) return 0
  const code = queryParts(lot.id)
  if (query.letters && !code.letters.startsWith(query.letters)) return 0
  if (query.nums.length === 0) return query.letters === code.letters ? 50 : 30
  if (query.nums.length > code.nums.length) return 0
  for (let i = 0; i < query.nums.length; i += 1) {
    if (code.nums[i] !== query.nums[i]) return 0
  }
  if (query.letters === code.letters && query.nums.length === code.nums.length) return 100
  if (query.nums.length === code.nums.length) return 80
  return 60
}

export function searchLots(lots: LotFeature[], raw: string) {
  const query = queryParts(raw.trim())
  if (!query.letters && query.nums.length === 0) return []
  return lots
    .map((lot) => ({ lot, score: matchScore(lot.properties, query) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.lot.properties.id.localeCompare(b.lot.properties.id))
}

export function bestMatch(lots: LotFeature[], raw: string) {
  const found = searchLots(lots, raw)
  if (found.length === 0) return { lot: null as LotFeature | null, ambiguous: false }
  const top = found[0].score
  const leaders = found.filter((item) => item.score === top)
  if (leaders.length === 1 || top === 100) return { lot: leaders[0].lot, ambiguous: leaders.length > 1 && top !== 100 }
  return { lot: null, ambiguous: true }
}

export function downloadLots(lots: LotFeature[], statuses: Record<string, SaleStatus>) {
  const collection: FeatureCollection = {
    type: 'FeatureCollection',
    features: lots.map((lot) => ({
      ...lot,
      properties: { ...lot.properties, status: lotStatus(statuses, lot.properties.id) },
    })),
  }
  const blob = new Blob([JSON.stringify(collection)], { type: 'application/geo+json' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = 'dragon-lots.geojson'
  link.click()
  URL.revokeObjectURL(link.href)
}

export function geometryCenterX(geometry: Polygon) {
  const ring = geometry.coordinates[0]
  const sum = ring.reduce((total, point) => total + point[0], 0)
  return sum / ring.length
}
