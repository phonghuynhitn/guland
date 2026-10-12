import type { Feature, Polygon } from 'geojson'

export const MIN_LOT_ZOOM = 17

export const LOT_STYLE: Record<string, { name: string; color: string }> = {
  O: { name: 'Đất ở', color: '#F6E27A' },
  TMD: { name: 'Thương mại, dịch vụ', color: '#E07A9A' },
  SX: { name: 'Sản xuất, kho', color: '#C084FC' },
  CC: { name: 'Công trình công cộng', color: '#F2C14E' },
  CX: { name: 'Cây xanh, công viên', color: '#6FBF73' },
  MN: { name: 'Mặt nước', color: '#5BA3D9' },
  HH: { name: 'Trong ranh, chưa tách loại', color: '#E7D3B0' },
}

export type LotProps = {
  soTo: number
  soThua: number
  areaM2: number
  code: string
  address: string
}

export type LotFeature = Feature<Polygon, LotProps>

export type LotBox = [number, number, number, number]

export function lotKey(lot: LotProps) {
  return `${lot.soTo}-${lot.soThua}`
}

export function lotBoxes(lots: LotFeature[]): LotBox[] {
  return lots.map((lot) => {
    let west = Infinity
    let south = Infinity
    let east = -Infinity
    let north = -Infinity
    for (const [lng, lat] of lot.geometry.coordinates[0]) {
      west = Math.min(west, lng)
      east = Math.max(east, lng)
      south = Math.min(south, lat)
      north = Math.max(north, lat)
    }
    return [west, south, east, north]
  })
}

export function lotsInBounds(lots: LotFeature[], boxes: LotBox[], west: number, south: number, east: number, north: number) {
  const visible: LotFeature[] = []
  for (let i = 0; i < lots.length; i++) {
    const box = boxes[i]
    if (box[2] < west || box[0] > east || box[3] < south || box[1] > north) continue
    visible.push(lots[i])
  }
  return visible
}

export function lotLabel(lot: LotProps) {
  const style = LOT_STYLE[lot.code] ?? LOT_STYLE.HH
  return { ...style, code: lot.code in LOT_STYLE ? lot.code : 'HH' }
}
