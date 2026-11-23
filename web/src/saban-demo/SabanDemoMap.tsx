import { useEffect, useMemo, useRef } from 'react'
import L from 'leaflet'
import type { Feature, FeatureCollection, Polygon } from 'geojson'
import { CircleMarker, GeoJSON, MapContainer, Polygon as ZonePolygon, Polyline, Popup, TileLayer, useMap } from 'react-leaflet'
import {
  IDLE_LOT,
  STATUS_META,
  demoStatus,
  frameToLatLng,
  identityTweak,
  khuOf,
  latLngToFrame,
  overlayUrl,
  type BaseLayer,
  type Lot,
  type PlanMeta,
  type SaleStatus,
} from './model'

const TILES: Record<BaseLayer, { url: string; attribution: string; subdomains?: string[]; maxNativeZoom: number }> = {
  satellite: {
    url: 'https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
    subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
    attribution: 'Ảnh vệ tinh &copy; Google',
    maxNativeZoom: 20,
  },
  streets: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Bản đồ nền &copy; Esri, HERE, Garmin, &copy; OpenStreetMap contributors',
    maxNativeZoom: 19,
  },
}

type Props = {
  meta: PlanMeta
  lots: Lot[]
  base: BaseLayer
  zone: string
  active: SaleStatus[]
  selectedId: string | null
  focusNonce: number
  onSelect: (id: string) => void
  onToggleBase: () => void
  preview: PlanMeta
  opacity: number
  unlocked: boolean
  dragLayer: boolean
  hideLots: boolean
  alignZone: string | null
  focusZone: string | null
  focusZoneNonce: number
  onDrag: (east: number, north: number) => void
  onDragEnd: () => void
  sketching: boolean
  sketchZone: string | null
  draft: [number, number][]
  onSketch: (point: [number, number]) => void
}

function projectBounds(meta: PlanMeta) {
  const { width, height } = meta.frame
  const points: [number, number][] = [
    frameToLatLng(meta, 0, 0),
    frameToLatLng(meta, width, 0),
    frameToLatLng(meta, width, height),
    frameToLatLng(meta, 0, height),
  ]
  for (const [zone, anchor] of Object.entries(meta.anchors ?? {})) {
    points.push(
      frameToLatLng(meta, anchor.minX, anchor.minY, zone),
      frameToLatLng(meta, anchor.maxX, anchor.minY, zone),
      frameToLatLng(meta, anchor.maxX, anchor.maxY, zone),
      frameToLatLng(meta, anchor.minX, anchor.maxY, zone),
    )
    for (const [x, y] of meta.zoneOutlines?.[zone] ?? []) points.push(frameToLatLng(meta, x, y, zone))
  }
  return L.latLngBounds(points)
}

function closedRing(meta: PlanMeta, ring: [number, number][], zone?: string) {
  const points = ring.map(([x, y]) => {
    const [lat, lng] = frameToLatLng(meta, x, y, zone)
    return [lng, lat]
  })
  const first = points[0]
  const last = points[points.length - 1]
  if (!first || !last) return points
  if (first[0] !== last[0] || first[1] !== last[1]) points.push(first)
  return points
}

function LockView({ bounds, free }: { bounds: L.LatLngBounds; free: boolean }) {
  const map = useMap()
  const fitted = useRef(false)
  useEffect(() => {
    const apply = () => {
      if (map.getSize().x < 40) return
      const zoom = map.getBoundsZoom(bounds, false, L.point(28, 28))
      map.setMinZoom(free ? Math.max(zoom - 2, 12) : zoom)
      map.setMaxBounds(free ? (null as unknown as L.LatLngBounds) : bounds)
      if (!fitted.current) {
        map.setView(bounds.getCenter(), zoom, { animate: false })
        fitted.current = true
      }
    }
    apply()
    map.whenReady(apply)
  }, [bounds, free, map])
  return null
}

function FlyTo({ lot, meta, nonce }: { lot: Lot | null; meta: PlanMeta; nonce: number }) {
  const map = useMap()
  useEffect(() => {
    if (!nonce || !lot) return
    const bounds = L.latLngBounds(lot.ring.map(([x, y]) => frameToLatLng(meta, x, y, lot.zone)))
    map.fitBounds(bounds, { padding: [80, 80], maxZoom: 19, animate: true })
  }, [nonce, lot, map, meta])
  return null
}

function ZoomBridge({ onReady }: { onReady: (map: L.Map) => void }) {
  const map = useMap()
  useEffect(() => {
    onReady(map)
  }, [map, onReady])
  return null
}

function toImagePixels(meta: PlanMeta, ring: [number, number][], width: number, height: number) {
  const { x, y, width: frameWidth, height: frameHeight } = meta.overlay
  return ring.map(([fx, fy]) => [((fx - x) / frameWidth) * width, ((fy - y) / frameHeight) * height] as [number, number])
}

function ringPath(ring: [number, number][]) {
  const [first, ...rest] = ring
  if (!first) return ''
  return `M ${first[0].toFixed(2)} ${first[1].toFixed(2)} ${rest.map(([x, y]) => `L ${x.toFixed(2)} ${y.toFixed(2)}`).join(' ')} Z`
}

function clipShowing(rings: [number, number][][]) {
  return `path(evenodd, '${rings.map(ringPath).join(' ')}')`
}

function clipHiding(width: number, height: number, holes: [number, number][][]) {
  return `path(evenodd, 'M 0 0 H ${width} V ${height} H 0 Z ${holes.map(ringPath).join(' ')}')`
}

function applyClip(img: HTMLImageElement, value: string) {
  img.style.clipPath = value
  img.style.setProperty('-webkit-clip-path', value)
}

function clearClip(img: HTMLImageElement) {
  img.style.clipPath = 'none'
  img.style.setProperty('-webkit-clip-path', 'none')
}

function PlanImage({ meta, opacity }: { meta: PlanMeta; opacity: number }) {
  const map = useMap()
  const metaRef = useRef(meta)
  const opacityRef = useRef(opacity)
  const placeRef = useRef<() => void>(() => {})
  metaRef.current = meta
  opacityRef.current = opacity

  useEffect(() => {
    const pane = map.getPane('planPane')
    if (!pane) return
    pane.querySelectorAll('.plan-overlay').forEach((node) => node.remove())
    const img = document.createElement('img')
    img.className = 'plan-overlay leaflet-zoom-animated'
    img.alt = ''
    img.draggable = false
    img.style.position = 'absolute'
    img.style.left = '0'
    img.style.top = '0'
    img.style.maxWidth = 'none'
    img.style.transformOrigin = '0 0'
    img.style.pointerEvents = 'none'
    pane.prepend(img)
    const clones = new Map<string, HTMLImageElement>()

    const animMap = map as L.Map & {
      _animatingZoom?: boolean
      _latLngToNewLayerPoint: (latlng: L.LatLng, zoom: number, center: L.LatLng) => L.Point
    }
    const placeImage = (node: HTMLImageElement, zone: string | undefined, zoom?: number, center?: L.LatLng) => {
      const current = metaRef.current
      const width = node.naturalWidth
      const height = node.naturalHeight
      if (!width || !height) return
      node.style.width = `${width}px`
      node.style.height = `${height}px`
      node.style.opacity = String(opacityRef.current)
      const { x, y, width: frameWidth, height: frameHeight } = current.overlay
      const toPoint = (lat: number, lng: number) =>
        zoom != null && center
          ? animMap._latLngToNewLayerPoint(L.latLng(lat, lng), zoom, center)
          : map.latLngToLayerPoint([lat, lng])
      const corner = (fx: number, fy: number) => {
        const [lat, lng] = frameToLatLng(current, fx, fy, zone)
        return toPoint(lat, lng)
      }
      const nw = corner(x, y)
      const ne = corner(x + frameWidth, y)
      const sw = corner(x, y + frameHeight)
      const a = (ne.x - nw.x) / width
      const b = (ne.y - nw.y) / width
      const c = (sw.x - nw.x) / height
      const d = (sw.y - nw.y) / height
      node.style.transform = `matrix(${a}, ${b}, ${c}, ${d}, ${nw.x}, ${nw.y})`
    }
    const place = (zoom?: number, center?: L.LatLng) => {
      if (!img.isConnected) return
      const current = metaRef.current
      const width = img.naturalWidth
      const height = img.naturalHeight
      if (!width || !height) return
      const moved: { zone: string; ring: [number, number][] }[] = []
      for (const [zone, ring] of Object.entries(current.zoneOutlines ?? {})) {
        const tweak = current.zoneTweaks?.[zone]
        if (ring.length >= 3 && tweak && !identityTweak(tweak)) moved.push({ zone, ring: toImagePixels(current, ring, width, height) })
      }
      const hide = moved.map((item) => item.ring)
      if (hide.length === 0) clearClip(img)
      else applyClip(img, clipHiding(width, height, hide))
      placeImage(img, undefined, zoom, center)
      const keep = new Set(moved.map((item) => item.zone))
      for (const [zone, node] of clones) {
        if (keep.has(zone)) continue
        node.remove()
        clones.delete(zone)
      }
      for (const item of moved) {
        let node = clones.get(item.zone)
        if (!node) {
          node = document.createElement('img')
          node.className = 'plan-overlay leaflet-zoom-animated'
          node.alt = ''
          node.draggable = false
          node.dataset.zone = item.zone
          node.style.position = 'absolute'
          node.style.left = '0'
          node.style.top = '0'
          node.style.maxWidth = 'none'
          node.style.transformOrigin = '0 0'
          node.style.pointerEvents = 'none'
          node.src = img.src
          pane.append(node)
          clones.set(item.zone, node)
          if (!node.complete) node.onload = () => placeRef.current()
        }
        applyClip(node, clipShowing([item.ring]))
        placeImage(node, item.zone, zoom, center)
      }
    }
    const placeSettled = () => {
      if (animMap._animatingZoom) return
      place()
    }
    const placeAnimated = (event: L.ZoomAnimEvent) => {
      place(event.zoom, event.center)
    }
    placeRef.current = place
    img.src = overlayUrl(metaRef.current.overlay.image)
    img.onload = () => place()
    map.on('move zoom viewreset resize', placeSettled)
    map.on('zoomanim', placeAnimated)
    return () => {
      map.off('move zoom viewreset resize', placeSettled)
      map.off('zoomanim', placeAnimated)
      img.remove()
      for (const node of clones.values()) node.remove()
    }
  }, [map])

  useEffect(() => {
    placeRef.current()
  }, [meta, opacity])

  return null
}

function LotVisibility({ hidden }: { hidden: boolean }) {
  const map = useMap()
  useEffect(() => {
    const pane = map.getPane('lotPane')
    if (pane) pane.style.opacity = hidden ? '0' : '1'
  }, [hidden, map])
  return null
}

function AlignGesture({ enabled, onMove, onEnd }: { enabled: boolean; onMove: (east: number, north: number) => void; onEnd: () => void }) {
  const map = useMap()
  const onMoveRef = useRef(onMove)
  const onEndRef = useRef(onEnd)
  onMoveRef.current = onMove
  onEndRef.current = onEnd
  useEffect(() => {
    if (!enabled) return
    map.dragging.disable()
    const container = map.getContainer()
    const previousCursor = container.style.cursor
    container.style.cursor = 'grab'
    let last: { x: number; y: number } | null = null
    let moved = false
    const down = (event: PointerEvent) => {
      if (event.button !== 0) return
      const target = event.target as HTMLElement
      if (target.closest('.map-controls, .leaflet-control, .leaflet-popup')) return
      last = { x: event.clientX, y: event.clientY }
      moved = false
      container.style.cursor = 'grabbing'
    }
    const move = (event: PointerEvent) => {
      if (!last) return
      const dx = event.clientX - last.x
      const dy = event.clientY - last.y
      if (dx === 0 && dy === 0) return
      moved = true
      last = { x: event.clientX, y: event.clientY }
      const lat = map.getCenter().lat
      const scale = (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** map.getZoom()
      onMoveRef.current(dx * scale, -dy * scale)
    }
    const up = () => {
      if (!last) return
      last = null
      container.style.cursor = 'grab'
      if (moved) onEndRef.current()
    }
    container.addEventListener('pointerdown', down)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      container.removeEventListener('pointerdown', down)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      container.style.cursor = previousCursor
      map.dragging.enable()
    }
  }, [enabled, map])
  return null
}

function MapPanes() {
  const map = useMap()
  const lots = map.getPane('lotPane') ?? map.createPane('lotPane')
  lots.style.zIndex = '500'
  const plan = map.getPane('planPane') ?? map.createPane('planPane')
  plan.style.zIndex = '450'
  plan.style.pointerEvents = 'none'
  const selected = map.getPane('selectPane') ?? map.createPane('selectPane')
  selected.style.zIndex = '560'
  selected.style.pointerEvents = 'none'
  return null
}

const LABEL_INK: Record<SaleStatus, string> = {
  available: '#1c1c1c',
  holding: '#ffffff',
  deposited: '#ffffff',
  contract: '#ffffff',
  liquidated: '#1c1c1c',
}

type LotLabel = {
  code: string
  status: SaleStatus
  zone: string
  x: number
  y: number
  longA: [number, number]
  longB: [number, number]
  shortA: [number, number]
  shortB: [number, number]
}

type DrawCanvas = L.Canvas & {
  _redraw: () => void
  _redrawBounds: { min: L.Point; max: L.Point } | null
  _ctx: CanvasRenderingContext2D | null
  _map: L.Map | null
}

function lotAxes(ring: [number, number][]) {
  const closed =
    ring.length > 1 &&
    ring[0][0] === ring[ring.length - 1][0] &&
    ring[0][1] === ring[ring.length - 1][1]
  const points = closed ? ring.slice(0, -1) : ring
  let longest = -1
  let index = 0
  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    const span = (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2
    if (span > longest) {
      longest = span
      index = i
    }
  }
  const longA = points[index]
  const longB = points[(index + 1) % points.length]
  const dx = longB[0] - longA[0]
  const dy = longB[1] - longA[1]
  const length = Math.hypot(dx, dy) || 1
  const px = -dy / length
  const py = dx / length
  let min = 0
  let max = 0
  for (const [x, y] of points) {
    const across = (x - longA[0]) * px + (y - longA[1]) * py
    if (across < min) min = across
    if (across > max) max = across
  }
  const thick = Math.max(max - min, 0.01)
  return {
    longA,
    longB,
    shortA: longA,
    shortB: [longA[0] + px * thick, longA[1] + py * thick] as [number, number],
  }
}

function ringCentroid(ring: [number, number][]): [number, number] {
  const closed =
    ring.length > 1 &&
    ring[0][0] === ring[ring.length - 1][0] &&
    ring[0][1] === ring[ring.length - 1][1]
  const points = closed ? ring.slice(0, -1) : ring
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
    return [
      points.reduce((sum, point) => sum + point[0], 0) / count,
      points.reduce((sum, point) => sum + point[1], 0) / count,
    ]
  }
  return [cx / (3 * area), cy / (3 * area)]
}

function lotLabels(lots: Lot[]): LotLabel[] {
  return lots.map((lot) => {
    const [x, y] = ringCentroid(lot.ring)
    return {
      code: lot.code,
      status: demoStatus(lot.code),
      zone: lot.zone,
      x,
      y,
      ...lotAxes(lot.ring),
    }
  })
}

function paintLotCodes(
  renderer: DrawCanvas,
  region: L.Bounds | null,
  labels: LotLabel[],
  meta: PlanMeta,
  active: SaleStatus[],
  zone: string,
) {
  const map = renderer._map
  const ctx = renderer._ctx
  if (!map || !ctx) return
  ctx.save()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (const lot of labels) {
    const lit = active.includes(lot.status) && (zone === 'all' || lot.zone === zone)
    const point = map.latLngToLayerPoint(frameToLatLng(meta, lot.x, lot.y, lot.zone))
    if (region && !region.contains(point)) continue
    const head = map.latLngToLayerPoint(frameToLatLng(meta, lot.longA[0], lot.longA[1], lot.zone))
    const tail = map.latLngToLayerPoint(frameToLatLng(meta, lot.longB[0], lot.longB[1], lot.zone))
    const side = map.latLngToLayerPoint(frameToLatLng(meta, lot.shortB[0], lot.shortB[1], lot.zone))
    const sideStart = map.latLngToLayerPoint(frameToLatLng(meta, lot.shortA[0], lot.shortA[1], lot.zone))
    let dx = tail.x - head.x
    let dy = tail.y - head.y
    const longLen = Math.hypot(dx, dy)
    const shortLen = Math.hypot(side.x - sideStart.x, side.y - sideStart.y)
    if (longLen < 16 || shortLen < 8) continue
    if (dx < 0 || (Math.abs(dx) < 0.01 && dy > 0)) {
      dx = -dx
      dy = -dy
    }
    let size = Math.min(shortLen * 0.72, 15)
    if (size < 7) continue
    ctx.font = `600 ${size}px Inter, system-ui, sans-serif`
    const textWidth = ctx.measureText(lot.code).width
    if (textWidth > longLen * 0.9) {
      size *= (longLen * 0.9) / textWidth
      if (size < 6.5) continue
      ctx.font = `600 ${size}px Inter, system-ui, sans-serif`
    }
    const ink = lit ? LABEL_INK[lot.status] : IDLE_LOT.ink
    ctx.save()
    ctx.translate(point.x, point.y)
    ctx.rotate(Math.atan2(dy, dx))
    ctx.fillStyle = ink
    if (ink !== '#ffffff') {
      ctx.lineJoin = 'round'
      ctx.lineWidth = 1
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'
      ctx.strokeText(lot.code, 0, 0)
    }
    ctx.fillText(lot.code, 0, 0)
    ctx.restore()
  }
  ctx.restore()
}

function FlyToZone({ zone, meta, nonce }: { zone: string | null; meta: PlanMeta; nonce: number }) {
  const map = useMap()
  const metaRef = useRef(meta)
  metaRef.current = meta
  useEffect(() => {
    if (!nonce || !zone) return
    const current = metaRef.current
    const anchor = current.anchors?.[zone]
    const outline = current.zoneOutlines?.[zone] ?? []
    if (!anchor && outline.length < 3) return
    const corners: [number, number][] = []
    if (anchor) corners.push([anchor.minX, anchor.minY], [anchor.maxX, anchor.minY], [anchor.maxX, anchor.maxY], [anchor.minX, anchor.maxY])
    corners.push(...outline)
    map.fitBounds(L.latLngBounds(corners.map(([x, y]) => frameToLatLng(current, x, y, zone))), { padding: [80, 80], maxZoom: 18, animate: true })
  }, [nonce, zone, map])
  return null
}

function ZoneSketch({
  meta,
  zone,
  draft,
  enabled,
  onAdd,
}: {
  meta: PlanMeta
  zone: string | null
  draft: [number, number][]
  enabled: boolean
  onAdd: (point: [number, number]) => void
}) {
  const map = useMap()
  const onAddRef = useRef(onAdd)
  const metaRef = useRef(meta)
  const zoneRef = useRef(zone)
  onAddRef.current = onAdd
  metaRef.current = meta
  zoneRef.current = zone

  useEffect(() => {
    if (!enabled) return
    map.dragging.disable()
    map.doubleClickZoom.disable()
    const container = map.getContainer()
    const previous = container.style.cursor
    container.style.cursor = 'crosshair'
    let start: { x: number; y: number } | null = null
    const ignore = (event: Event) => Boolean((event.target as HTMLElement | null)?.closest('.map-controls, .leaflet-control'))
    const down = (event: PointerEvent) => {
      if (event.button !== 0 || ignore(event)) return
      event.preventDefault()
      event.stopPropagation()
      start = { x: event.clientX, y: event.clientY }
    }
    const up = (event: PointerEvent) => {
      if (!start || ignore(event)) {
        start = null
        return
      }
      const moved = Math.hypot(event.clientX - start.x, event.clientY - start.y)
      start = null
      if (moved > 6) return
      event.preventDefault()
      event.stopPropagation()
      const name = zoneRef.current
      if (!name) return
      const latlng = map.mouseEventToLatLng(event)
      const [x, y] = latLngToFrame(metaRef.current, latlng.lat, latlng.lng, name)
      if (!Number.isFinite(x) || !Number.isFinite(y)) return
      onAddRef.current([x, y])
    }
    container.addEventListener('pointerdown', down, true)
    container.addEventListener('pointerup', up, true)
    return () => {
      container.removeEventListener('pointerdown', down, true)
      container.removeEventListener('pointerup', up, true)
      container.style.cursor = previous
      map.dragging.enable()
      map.doubleClickZoom.enable()
    }
  }, [enabled, map])

  const outlines = Object.entries(meta.zoneOutlines ?? {}).filter((entry) => entry[1].length >= 3)
  return (
    <>
      {outlines.map(([name, ring]) => (
        <ZonePolygon
          key={name}
          positions={ring.map(([x, y]) => frameToLatLng(meta, x, y, name))}
          pathOptions={{
            pane: 'selectPane',
            color: name === zone ? '#7c3aed' : '#64748b',
            weight: name === zone ? 3 : 2,
            dashArray: name === zone ? undefined : '6 6',
            fillColor: name === zone ? '#7c3aed' : '#64748b',
            fillOpacity: 0.08,
            interactive: false,
          }}
        />
      ))}
      {zone && draft.length >= 3 && (
        <ZonePolygon
          positions={draft.map(([x, y]) => frameToLatLng(meta, x, y, zone))}
          pathOptions={{ pane: 'selectPane', color: '#ea580c', weight: 3, fillColor: '#ea580c', fillOpacity: 0.16, interactive: false }}
        />
      )}
      {zone && draft.length === 2 && (
        <Polyline
          positions={draft.map(([x, y]) => frameToLatLng(meta, x, y, zone))}
          pathOptions={{ pane: 'selectPane', color: '#ea580c', weight: 3, interactive: false }}
        />
      )}
      {zone &&
        draft.map((point, index) => (
          <CircleMarker
            key={`${index}:${point[0]}:${point[1]}`}
            center={frameToLatLng(meta, point[0], point[1], zone)}
            radius={5}
            pathOptions={{ pane: 'selectPane', color: '#ea580c', weight: 2, fillColor: '#fff', fillOpacity: 1, interactive: false }}
          />
        ))}
    </>
  )
}

export default function SabanDemoMap({
  meta,
  lots,
  base,
  zone,
  active,
  selectedId,
  focusNonce,
  onSelect,
  onToggleBase,
  preview,
  opacity,
  unlocked,
  dragLayer,
  hideLots,
  alignZone,
  focusZone,
  focusZoneNonce,
  onDrag,
  onDragEnd,
  sketching,
  sketchZone,
  draft,
  onSketch,
}: Props) {
  const mapRef = useRef<L.Map | null>(null)
  const dragRef = useRef(dragLayer)
  dragRef.current = dragLayer
  const bounds = useMemo(() => projectBounds(meta), [meta])
  const labels = useMemo(() => lotLabels(lots), [lots])
  const labelsRef = useRef(labels)
  const viewRef = useRef({ meta, active, zone })
  labelsRef.current = labels
  viewRef.current = { meta, active, zone }
  const renderer = useMemo(() => {
    const canvas = L.canvas({ padding: 0.5, pane: 'lotPane' }) as DrawCanvas
    const redraw = canvas._redraw.bind(canvas)
    canvas._redraw = function () {
      const raw = this._redrawBounds
      const region = raw
        ? L.bounds(L.point(raw.min).subtract([48, 48]), L.point(raw.max).add([48, 48]))
        : null
      redraw()
      const view = viewRef.current
      paintLotCodes(this, region, labelsRef.current, view.meta, view.active, view.zone)
    }
    return canvas
  }, [])
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (unlocked) map.keyboard.disable()
    else map.keyboard.enable()
  }, [unlocked])
  const tile = TILES[base]
  const selected = lots.find((lot) => lot.id === selectedId) ?? null

  const collection = useMemo<FeatureCollection<Polygon>>(() => {
    const features: Feature<Polygon>[] = lots.map((lot) => ({
      type: 'Feature',
      properties: {
        id: lot.id,
        status: demoStatus(lot.code),
        zone: lot.zone,
        ring: lot.ring,
      },
      geometry: { type: 'Polygon', coordinates: [closedRing(meta, lot.ring, lot.zone)] },
    }))
    return { type: 'FeatureCollection', features }
  }, [lots, meta])

  const geoRef = useRef<L.GeoJSON | null>(null)
  useEffect(() => {
    const group = geoRef.current
    if (!group) return
    group.eachLayer((layer) => {
      const polygon = layer as L.Polygon & { feature?: Feature<Polygon> }
      const ring = polygon.feature?.properties?.ring as [number, number][] | undefined
      const lotZone = polygon.feature?.properties?.zone as string | undefined
      if (!ring || lotZone === undefined) return
      polygon.setLatLngs(ring.map(([x, y]) => frameToLatLng(meta, x, y, lotZone)))
    })
  }, [meta])
  const membership = useMemo(() => {
    let hash = 2166136261
    for (const lot of lots) {
      for (let i = 0; i < lot.zone.length; i++) {
        hash ^= lot.zone.charCodeAt(i)
        hash = Math.imul(hash, 16777619)
      }
      hash = Math.imul(hash ^ 31, 16777619)
    }
    return (hash >>> 0).toString(16)
  }, [lots])
  const paintKey = `${active.join(',')}|${zone}|${membership}`

  return (
    <MapContainer
      className="demo-map"
      center={[meta.center.lat, meta.center.lng]}
      zoom={16}
      zoomControl={false}
      maxBounds={bounds}
      maxBoundsViscosity={1}
    >
      <TileLayer
        key={base}
        url={tile.url}
        attribution={tile.attribution}
        {...(tile.subdomains ? { subdomains: tile.subdomains } : {})}
        maxNativeZoom={tile.maxNativeZoom}
        maxZoom={tile.maxNativeZoom}
      />
      <MapPanes />
      <LockView bounds={bounds} free={unlocked} />
      <LotVisibility hidden={hideLots} />
      <AlignGesture enabled={dragLayer && !sketching} onMove={onDrag} onEnd={onDragEnd} />
      <ZoomBridge onReady={(map) => (mapRef.current = map)} />
      <FlyTo lot={selected} meta={meta} nonce={focusNonce} />
      <FlyToZone zone={focusZone} meta={meta} nonce={focusZoneNonce} />
      <GeoJSON
        ref={geoRef}
        key={paintKey}
        pane="lotPane"
        data={collection}
        style={(feature) => {
          const status = feature?.properties?.status as SaleStatus
          const lotZone = feature?.properties?.zone as string
          const lit = active.includes(status) && (zone === 'all' || lotZone === zone)
          const quiet = alignZone != null && lotZone !== alignZone
          return {
            renderer,
            stroke: true,
            color: IDLE_LOT.stroke,
            weight: 2,
            opacity: quiet ? 0.35 : 1,
            lineJoin: 'round',
            fill: true,
            fillColor: lit ? STATUS_META[status].color : IDLE_LOT.fill,
            fillOpacity: quiet ? 0.28 : lit || base !== 'satellite' ? 1 : 0.72,
          }
        }}
        onEachFeature={(feature, layer) => {
          layer.on('click', (event) => {
            if (dragRef.current) return
            L.DomEvent.stopPropagation(event)
            onSelect(feature.properties?.id as string)
          })
        }}
      />
      <PlanImage meta={preview} opacity={opacity} />
      {unlocked && <ZoneSketch meta={meta} zone={sketchZone} draft={draft} enabled={sketching} onAdd={onSketch} />}
      {selected && (
        <Polyline
          positions={[...selected.ring, selected.ring[0]].map(([x, y]) => frameToLatLng(meta, x, y, selected.zone))}
          pathOptions={{ pane: 'selectPane', color: '#111827', weight: 2, interactive: false }}
        />
      )}
      {selected && (
        <Popup
          position={frameToLatLng(meta, selected.x, selected.y, selected.zone)}
          offset={[0, -8]}
          autoPan={false}
          closeButton={false}
          className="lot-popup"
        >
          <div className="pop">
            <div className="pop-head">
              <div>
                <strong>{selected.code}</strong>
                <span>{khuOf(selected.code)}</span>
              </div>
              <em style={{ background: STATUS_META[demoStatus(selected.code)].color }}>
                {STATUS_META[demoStatus(selected.code)].label}
              </em>
              <button type="button" onClick={() => onSelect(selected.id)} aria-label="Đóng">
                ×
              </button>
            </div>
            <dl>
              <div>
                <dt>Phân khu</dt>
                <dd>{selected.zone || '—'}</dd>
              </div>
              <div>
                <dt>Diện tích</dt>
                <dd>—</dd>
              </div>
              <div>
                <dt>Hướng</dt>
                <dd>—</dd>
              </div>
              <div>
                <dt>Đơn giá</dt>
                <dd>—</dd>
              </div>
              <div>
                <dt>Thành tiền</dt>
                <dd>—</dd>
              </div>
            </dl>
          </div>
        </Popup>
      )}
      <div className="map-controls">
        <button type="button" onClick={() => mapRef.current?.zoomIn()} aria-label="Phóng to">
          +
        </button>
        <button type="button" onClick={() => mapRef.current?.zoomOut()} aria-label="Thu nhỏ">
          −
        </button>
        <button type="button" className={base === 'streets' ? 'on' : ''} onClick={onToggleBase}>
          {base === 'satellite' ? 'Vệ tinh' : 'Giao thông'}
        </button>
      </div>
    </MapContainer>
  )
}
