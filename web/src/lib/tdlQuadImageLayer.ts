import L from 'leaflet'

/** Image corners: top-left, top-right, bottom-right, bottom-left (lat, lng). */
export type GeoCorners = [number, number][]

type Point = { x: number; y: number }

function drawImageTriangle(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  sx0: number,
  sy0: number,
  sx1: number,
  sy1: number,
  sx2: number,
  sy2: number,
  d0: Point,
  d1: Point,
  d2: Point,
) {
  const denom = sx0 * (sy2 - sy1) + sx1 * (sy0 - sy2) + sx2 * (sy1 - sy0)
  if (Math.abs(denom) < 1e-8) return

  ctx.save()
  ctx.beginPath()
  ctx.moveTo(d0.x, d0.y)
  ctx.lineTo(d1.x, d1.y)
  ctx.lineTo(d2.x, d2.y)
  ctx.closePath()
  ctx.clip()

  const m11 = (d0.x * (sy2 - sy1) + d1.x * (sy0 - sy2) + d2.x * (sy1 - sy0)) / denom
  const m12 = (d0.y * (sy2 - sy1) + d1.y * (sy0 - sy2) + d2.y * (sy1 - sy0)) / denom
  const m21 = (d0.x * (sx1 - sx2) + d1.x * (sx2 - sx0) + d2.x * (sx0 - sx1)) / denom
  const m22 = (d0.y * (sx1 - sx2) + d1.y * (sx2 - sx0) + d2.y * (sx0 - sx1)) / denom
  const dx = (d0.x * (sx2 * sy1 - sx1 * sy2) + d1.x * (sx0 * sy2 - sx2 * sy0) + d2.x * (sx1 * sy0 - sx0 * sy1)) / denom
  const dy = (d0.y * (sx2 * sy1 - sx1 * sy2) + d1.y * (sx0 * sy2 - sx2 * sy0) + d2.y * (sx1 * sy0 - sx0 * sy1)) / denom

  ctx.setTransform(m11, m12, m21, m22, dx, dy)
  ctx.drawImage(img, 0, 0)
  ctx.restore()
}

function warpToQuad(ctx: CanvasRenderingContext2D, img: HTMLImageElement, quad: Point[]) {
  const w = img.naturalWidth
  const h = img.naturalHeight
  const [tl, tr, br, bl] = quad
  // Diagonal TL–BR folds on skewed sites; split along TR–BL instead.
  drawImageTriangle(ctx, img, 0, 0, w, 0, 0, h, tl, tr, bl)
  drawImageTriangle(ctx, img, w, 0, w, h, 0, h, tr, br, bl)
}

export class QuadWarpLayer extends L.Layer {
  private canvas: HTMLCanvasElement | null = null
  private img: HTMLImageElement | null = null
  private url: string
  private corners: GeoCorners
  private opacity: number

  constructor(url: string, corners: GeoCorners, opacity: number) {
    super()
    this.url = url
    this.corners = corners
    this.opacity = opacity
  }

  onAdd(map: L.Map): this {
    this.canvas = L.DomUtil.create('canvas', 'leaflet-tdl-quad-image') as HTMLCanvasElement
    map.getPane('overlayPane')?.appendChild(this.canvas)

    const image = new Image()
    image.decoding = 'async'
    image.onload = () => this.redraw()
    this.img = image
    image.src = this.url
    if (image.complete && image.naturalWidth > 0) this.redraw()

    map.on('move zoom zoomend moveend viewreset resize', this.redraw, this)
    this.redraw()
    return this
  }

  onRemove(map: L.Map): this {
    map.off('move zoom zoomend moveend viewreset resize', this.redraw, this)
    this.canvas?.remove()
    this.canvas = null
    this.img = null
    return this
  }

  setCorners(corners: GeoCorners) {
    this.corners = corners
    this.redraw()
  }

  private redraw = () => {
    const map = this._map
    const canvas = this.canvas
    const img = this.img
    if (!map || !canvas || !img?.naturalWidth) return

    const size = map.getSize()
    const origin = map.containerPointToLayerPoint(L.point(0, 0))
    L.DomUtil.setPosition(canvas, origin)

    canvas.width = Math.max(1, size.x)
    canvas.height = Math.max(1, size.y)
    canvas.style.width = `${size.x}px`
    canvas.style.height = `${size.y}px`

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, size.x, size.y)

    const quad: Point[] = this.corners.map(([lat, lng]) => {
      const layer = map.latLngToLayerPoint(L.latLng(lat, lng))
      return { x: layer.x - origin.x, y: layer.y - origin.y }
    })

    ctx.globalAlpha = this.opacity
    warpToQuad(ctx, img, quad)
    ctx.globalAlpha = 1
  }
}

/** Fits the raster to all four WGS84 corners (same shape as the outline polygon). */
export function createQuadImageLayer(url: string, corners: GeoCorners, opacity = 1): QuadWarpLayer {
  if (corners.length !== 4) throw new Error('Need four corners (TL, TR, BR, BL)')
  return new QuadWarpLayer(url, corners, opacity)
}