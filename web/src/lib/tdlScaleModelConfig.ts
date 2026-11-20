const data = (file: string) => `${import.meta.env.BASE_URL}data/tdl-scale-model/${file}`
const layerData = (file: string) => `${import.meta.env.BASE_URL}data/tld-map-layer/${file}`

export const TDL_LOTS_URL = data('lots-wgs84.geojson')
export const TDL_AREA_IMAGE_URL = layerData('area.png')

/** Google satellite tiles for manual georef on /tdl-scale-model. */
export const GOOGLE_SATELLITE_TILE = 'https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}'
export const GOOGLE_TILE_SUBDOMAINS = ['mt0', 'mt1', 'mt2', 'mt3'] as const

export const PIN_LAT = 10.737477079512168
export const PIN_LNG = 106.46676936659878

/** WGS84 corners of area.png — trái trên, phải trên, phải dưới, trái dưới. */
export const AREA_TOP_LEFT: [number, number] = [10.732001217320768, 106.45635008456884]
export const AREA_TOP_RIGHT: [number, number] = [10.745662274399038, 106.47403119929365]
export const AREA_BOTTOM_RIGHT: [number, number] = [10.741677863235259, 106.47727130068228]
export const AREA_BOTTOM_LEFT: [number, number] = [10.727995543380407, 106.45952582004247]

export const CORNER_LABELS = ['Trái trên (TL)', 'Phải trên (TR)', 'Phải dưới (BR)', 'Trái dưới (BL)'] as const

/** Image warp order: TL → TR → BR → BL. */
export const areaImageQuad = (): [number, number][] => [
  AREA_TOP_LEFT,
  AREA_TOP_RIGHT,
  AREA_BOTTOM_RIGHT,
  AREA_BOTTOM_LEFT,
]

export const areaOutlineRing = (corners: [number, number][] = areaImageQuad()): [number, number][] => [
  ...corners,
  corners[0],
]

export function formatCornersForConfig(corners: [number, number][]): string {
  const [tl, tr, br, bl] = corners
  return [
    `export const AREA_TOP_LEFT: [number, number] = [${tl[0]}, ${tl[1]}]`,
    `export const AREA_TOP_RIGHT: [number, number] = [${tr[0]}, ${tr[1]}]`,
    `export const AREA_BOTTOM_RIGHT: [number, number] = [${br[0]}, ${br[1]}]`,
    `export const AREA_BOTTOM_LEFT: [number, number] = [${bl[0]}, ${bl[1]}]`,
  ].join('\n')
}

export type TdlLotProps = {
  id: string
  code: string
  layer: string
  boundary: string
  closed: boolean
  areaM2: number | null
}