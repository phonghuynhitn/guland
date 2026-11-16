import type { Feature, FeatureCollection, Point, Polygon } from 'geojson'

export type LotProps = {
  id: string
  code: string
  layer: string
  boundary: string
  closed: boolean
  areaM2: number | null
}

export type LotFeature = Feature<Polygon | Point, LotProps>

export type PlanMeta = {
  width: number
  height: number
  image: string
  title: string
  closed: number
  open: number
}

const dataUrl = (file: string) => `${import.meta.env.BASE_URL}data/saban2/${file}`

export const META_URL = dataUrl('meta.json')
export const LOTS_URL = dataUrl('lots.geojson')
export const planImageUrl = (file: string) => dataUrl(file)

export function lotBounds(lot: LotFeature): [[number, number], [number, number]] {
  const { geometry } = lot
  if (geometry.type === 'Point') {
    const [x, y] = geometry.coordinates
    return [
      [y - 40, x - 40],
      [y + 40, x + 40],
    ]
  }
  let west = Infinity
  let east = -Infinity
  let south = Infinity
  let north = -Infinity
  for (const [x, y] of geometry.coordinates[0]) {
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

export function searchLots(lots: LotFeature[], raw: string) {
  const query = raw.trim().toLowerCase()
  if (!query) return []
  const byCode = lots.filter((lot) => lot.properties.code.toLowerCase() === query)
  const found = byCode.length > 0 ? byCode : lots.filter((lot) => lot.properties.id.toLowerCase() === query)
  return found.sort(
    (a, b) => Number(b.properties.closed) - Number(a.properties.closed) || a.properties.id.localeCompare(b.properties.id, 'vi'),
  )
}

export function isLotCollection(value: unknown): value is FeatureCollection {
  return Boolean(value && typeof value === 'object' && (value as FeatureCollection).type === 'FeatureCollection')
}
