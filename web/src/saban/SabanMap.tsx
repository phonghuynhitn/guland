import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import { MapContainer, useMap, useMapEvents } from 'react-leaflet'
import '@geoman-io/leaflet-geoman-free'
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css'
import type { FeatureCollection, Polygon } from 'geojson'
import {
  STATUS_META,
  lotBounds,
  lotStatus,
  planImageUrl,
  swatchOf,
  viewBounds,
  zoneName,
  type ColorMode,
  type LotFeature,
  type PlanMeta,
  type SaleStatus,
  type ZoneId,
} from './model'

const MOBILE = 640

type Props = {
  meta: PlanMeta
  lots: LotFeature[]
  statuses: Record<string, SaleStatus>
  colorMode: ColorMode
  hiddenSwatches: string[]
  hiddenStatuses: SaleStatus[]
  selectedId: string | null
  focusNonce: number
  viewNonce: number
  viewZone: 'all' | ZoneId
  panelOpen: boolean
  editing: boolean
  drawing: boolean
  shaping: boolean
  onSelect: (id: string) => void
  onClose: (id: string) => void
  onGeometry: (id: string, geometry: Polygon) => void
  onCreate: (geometry: Polygon) => void
}

function padding(map: L.Map, panelOpen: boolean) {
  const mobile = map.getSize().x <= MOBILE
  if (mobile) {
    return {
      paddingTopLeft: L.point(16, 16),
      paddingBottomRight: L.point(16, panelOpen ? 240 : 72),
    }
  }
  return {
    paddingTopLeft: L.point(panelOpen ? 392 : 24, 24),
    paddingBottomRight: L.point(24, 24),
  }
}

function styleFor(lot: LotFeature, colorMode: ColorMode, status: SaleStatus): L.PathOptions {
  const fill = colorMode === 'status' ? STATUS_META[status].color : lot.properties.color
  return {
    color: colorMode === 'status' ? fill : '#111827',
    weight: 1,
    fillColor: fill,
    fillOpacity: colorMode === 'status' ? 0.78 : 0.5,
    opacity: 0.95,
  }
}

function ImageLayer({ meta }: { meta: PlanMeta }) {
  const map = useMap()
  useEffect(() => {
    const layer = L.imageOverlay(planImageUrl(meta.image), [
      [0, 0],
      [meta.height, meta.width],
    ])
    layer.addTo(map)
    return () => {
      layer.remove()
    }
  }, [map, meta])
  return null
}

function LotLayer({
  lots,
  statuses,
  colorMode,
  hiddenSwatches,
  hiddenStatuses,
  selectedId,
  shaping,
  drawing,
  onSelect,
}: {
  lots: LotFeature[]
  statuses: Record<string, SaleStatus>
  colorMode: ColorMode
  hiddenSwatches: string[]
  hiddenStatuses: SaleStatus[]
  selectedId: string | null
  shaping: boolean
  drawing: boolean
  onSelect: (id: string) => void
}) {
  const map = useMap()
  const renderer = useRef<L.Canvas | null>(null)
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect
  if (!renderer.current) renderer.current = L.canvas({ padding: 0.5 })

  const hiddenSwatchKey = hiddenSwatches.join('|')
  const hiddenStatusKey = hiddenStatuses.join('|')
  const statusKey = JSON.stringify(statuses)

  useEffect(() => {
    const hiddenSwatch = new Set(hiddenSwatchKey ? hiddenSwatchKey.split('|') : [])
    const hiddenStatus = new Set(hiddenStatusKey ? hiddenStatusKey.split('|') : [])
    const visible = lots.filter((lot) => {
      if (shaping && lot.properties.id === selectedId) return false
      if (lot.properties.id === selectedId) return true
      if (hiddenSwatch.has(lot.properties.swatch)) return false
      return !hiddenStatus.has(lotStatus(statuses, lot.properties.id))
    })
    const collection: FeatureCollection = { type: 'FeatureCollection', features: visible }
    const layer = L.geoJSON(collection, {
      renderer: renderer.current ?? undefined,
      interactive: !drawing,
      style: (feature) => styleFor(feature as LotFeature, colorMode, lotStatus(statuses, (feature as LotFeature).properties.id)),
      onEachFeature: (feature, path) => {
        path.on('click', () => {
          if (drawing) return
          onSelectRef.current((feature as LotFeature).properties.id)
        })
      },
    } as L.GeoJSONOptions)
    layer.addTo(map)
    return () => {
      layer.remove()
    }
  }, [lots, colorMode, hiddenSwatchKey, hiddenStatusKey, statusKey, selectedId, shaping, drawing, map, statuses])

  return null
}

function Highlight({ lot }: { lot: LotFeature | null }) {
  const map = useMap()
  useEffect(() => {
    if (!lot) return
    const layer = L.geoJSON(lot, {
      interactive: false,
      style: { className: 'lot-flash', color: '#dc2626', weight: 3, fillColor: '#dc2626', fillOpacity: 0.18 },
    })
    layer.addTo(map)
    return () => {
      layer.remove()
    }
  }, [lot, map])
  return null
}

function FlyTo({ lot, nonce, panelOpen }: { lot: LotFeature | null; nonce: number; panelOpen: boolean }) {
  const map = useMap()
  useEffect(() => {
    if (!nonce || !lot) return
    map.fitBounds(lotBounds(lot), { ...padding(map, panelOpen), maxZoom: 2, animate: true })
  }, [nonce, lot, map, panelOpen])
  return null
}

function FlyView({
  meta,
  zone,
  nonce,
  panelOpen,
  skipInitial,
}: {
  meta: PlanMeta
  zone: 'all' | ZoneId
  nonce: number
  panelOpen: boolean
  skipInitial: boolean
}) {
  const map = useMap()
  const fitted = useRef(false)
  useEffect(() => {
    if (!fitted.current) {
      fitted.current = true
      if (skipInitial) return
      map.invalidateSize()
      map.fitBounds(viewBounds(meta, 'all'), padding(map, panelOpen))
      return
    }
    if (!nonce) return
    map.fitBounds(viewBounds(meta, zone), { ...padding(map, panelOpen), animate: true })
  }, [nonce, zone, meta, map, panelOpen, skipInitial])
  return null
}

function Labels({ lots }: { lots: LotFeature[] }) {
  const map = useMap()
  const [tick, setTick] = useState(0)
  useMapEvents({
    moveend() {
      setTick((value) => value + 1)
    },
    zoomend() {
      setTick((value) => value + 1)
    },
  })
  useEffect(() => {
    const group = L.layerGroup()
    const bounds = map.getBounds()
    const scale = 2 ** map.getZoom()
    let shown = 0
    for (const lot of lots) {
      if (shown >= 70) break
      const [[south, west], [north, east]] = lotBounds(lot)
      if (!bounds.intersects(L.latLngBounds([south, west], [north, east]))) continue
      const size = Math.max(east - west, north - south) * scale
      if (size < 28) continue
      L.marker([(south + north) / 2, (west + east) / 2], {
        interactive: false,
        icon: L.divIcon({
          className: 'lot-label',
          html: lot.properties.id,
          iconSize: [88, 14],
          iconAnchor: [44, 7],
        }),
      }).addTo(group)
      shown += 1
    }
    group.addTo(map)
    return () => {
      group.remove()
    }
  }, [lots, tick, map])
  return null
}

function DrawNew({ enabled, onCreate }: { enabled: boolean; onCreate: (geometry: Polygon) => void }) {
  const map = useMap()
  const onCreateRef = useRef(onCreate)
  onCreateRef.current = onCreate
  useEffect(() => {
    if (!enabled) return
    map.pm.enableDraw('Polygon', {
      snappable: false,
      allowSelfIntersection: false,
      pathOptions: { color: '#dc2626', fillColor: '#dc2626', fillOpacity: 0.25, weight: 2 },
    })
    const handle = (event: L.LeafletEvent) => {
      const layer = (event as L.LeafletEvent & { layer: L.Polygon }).layer
      const geometry = layer.toGeoJSON().geometry
      map.removeLayer(layer)
      if (geometry.type === 'Polygon') onCreateRef.current(geometry)
    }
    map.on('pm:create', handle)
    return () => {
      map.pm.disableDraw()
      map.off('pm:create', handle)
    }
  }, [enabled, map])
  return null
}

function VertexEditor({ lot, onGeometry }: { lot: LotFeature; onGeometry: (id: string, geometry: Polygon) => void }) {
  const map = useMap()
  const onGeometryRef = useRef(onGeometry)
  onGeometryRef.current = onGeometry
  const lotId = lot.properties.id
  const featureRef = useRef(lot)
  if (featureRef.current.properties.id !== lotId) featureRef.current = lot
  useEffect(() => {
    const current = featureRef.current
    const layer = L.geoJSON(current, {
      style: { color: '#dc2626', weight: 2, fillColor: current.properties.color, fillOpacity: 0.35 },
    })
    layer.addTo(map)
    layer.eachLayer((path) => {
      const polygon = path as L.Polygon
      polygon.pm.enable({ allowSelfIntersection: false, draggable: true })
      const sync = () => {
        const geometry = polygon.toGeoJSON().geometry
        if (geometry.type === 'Polygon') onGeometryRef.current(current.properties.id, geometry)
      }
      polygon.on('pm:edit', sync)
      polygon.on('pm:dragend', sync)
    })
    return () => {
      layer.remove()
    }
  }, [lotId, map])
  return null
}

function lotAnchor(lot: LotFeature): L.LatLngExpression {
  const [[, west], [north, east]] = lotBounds(lot)
  return [north, (west + east) / 2]
}

function mapIsMoving(map: L.Map) {
  const moving = map as L.Map & { _animatingZoom?: boolean; _panAnim?: { _inProgress?: boolean } }
  return Boolean(moving._animatingZoom || moving._panAnim?._inProgress)
}

function popupContent(lot: LotFeature, status: SaleStatus) {
  const spec = swatchOf(lot.properties.swatch)
  const sale = STATUS_META[status]
  const root = document.createElement('div')
  root.className = 'lot-pop'

  const head = document.createElement('div')
  head.className = 'lot-pop-head'
  const code = document.createElement('strong')
  code.textContent = lot.properties.id
  const badge = document.createElement('span')
  badge.className = 'lot-pop-status'
  const dot = document.createElement('i')
  dot.style.background = sale.color
  badge.append(dot, document.createTextNode(sale.label))
  head.append(code, badge)

  const kind = document.createElement('p')
  kind.className = 'lot-pop-kind'
  kind.textContent = `${spec.productLabel} · ${spec.variantLabel}`

  const list = document.createElement('dl')
  const rows: [string, string][] = [
    ['Phân khu', zoneName(lot.properties.zone)],
    ['Kích thước', lot.properties.sizeLabel],
    ['Diện tích', `${lot.properties.areaM2.toLocaleString('vi-VN')} m²`],
  ]
  for (const [label, value] of rows) {
    const row = document.createElement('div')
    const term = document.createElement('dt')
    term.textContent = label
    const detail = document.createElement('dd')
    detail.textContent = value
    row.append(term, detail)
    list.append(row)
  }

  root.append(head, kind, list)
  return root
}

function LotPopup({
  lot,
  status,
  panelOpen,
  hidden,
  onClose,
}: {
  lot: LotFeature | null
  status: SaleStatus
  panelOpen: boolean
  hidden: boolean
  onClose: (id: string) => void
}) {
  const map = useMap()
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!lot || hidden) return
    const current = lot
    let popup: L.Popup | null = null
    let alive = true
    let opened = false
    let closedByUs = false

    const open = () => {
      if (!alive || opened) return
      opened = true
      const mobile = map.getSize().x <= MOBILE
      popup = L.popup({
        className: 'lot-popup',
        closeButton: true,
        autoPan: true,
        autoPanPaddingTopLeft: mobile ? L.point(16, 16) : L.point(panelOpen ? 392 : 24, 24),
        autoPanPaddingBottomRight: mobile ? L.point(16, panelOpen ? 240 : 72) : L.point(24, 24),
        offset: L.point(0, -4),
        minWidth: 200,
        maxWidth: 260,
      })
        .setLatLng(lotAnchor(current))
        .setContent(popupContent(current, status))
        .openOn(map)
      popup.on('remove', () => {
        if (!closedByUs) onCloseRef.current(current.properties.id)
      })
    }

    let moved = false
    const onMoveStart = () => {
      moved = true
    }
    map.on('movestart', onMoveStart)
    map.once('moveend', open)
    const timer = window.setTimeout(() => {
      if (!moved && !mapIsMoving(map)) open()
    }, 90)

    return () => {
      alive = false
      closedByUs = true
      window.clearTimeout(timer)
      map.off('movestart', onMoveStart)
      map.off('moveend', open)
      popup?.remove()
    }
  }, [lot, status, hidden, panelOpen, map])

  return null
}

function ZoomButtons() {
  const map = useMap()
  useEffect(() => {
    const control = L.control.zoom({ position: 'bottomright' }).addTo(map)
    return () => {
      control.remove()
    }
  }, [map])
  return null
}

export default function SabanMap(props: Props) {
  const selected = props.lots.find((lot) => lot.properties.id === props.selectedId) ?? null
  const shaping = props.editing && props.shaping
  const hiddenSwatch = new Set(props.hiddenSwatches)
  const hiddenStatus = new Set(props.hiddenStatuses)
  const labelLots = props.lots.filter((lot) => {
    if (lot.properties.id === props.selectedId) return true
    if (hiddenSwatch.has(lot.properties.swatch)) return false
    return !hiddenStatus.has(lotStatus(props.statuses, lot.properties.id))
  })
  return (
    <MapContainer
      className="saban-map"
      crs={L.CRS.Simple}
      center={[props.meta.height / 2, props.meta.width / 2]}
      zoom={0}
      minZoom={-4}
      maxZoom={3}
      zoomSnap={0.25}
      zoomControl={false}
      attributionControl={false}
      maxBounds={L.latLngBounds(
        [-props.meta.height * 0.2, -props.meta.width * 0.2],
        [props.meta.height * 1.2, props.meta.width * 1.2],
      )}
      maxBoundsViscosity={0.85}
    >
      <ImageLayer meta={props.meta} />
      <LotLayer
        lots={props.lots}
        statuses={props.statuses}
        colorMode={props.colorMode}
        hiddenSwatches={props.hiddenSwatches}
        hiddenStatuses={props.hiddenStatuses}
        selectedId={props.selectedId}
        shaping={shaping}
        drawing={props.editing && props.drawing}
        onSelect={props.onSelect}
      />
      <Highlight lot={shaping ? null : selected} />
      <LotPopup
        lot={selected}
        status={lotStatus(props.statuses, selected?.properties.id ?? '')}
        panelOpen={props.panelOpen}
        hidden={shaping || (props.editing && props.drawing)}
        onClose={props.onClose}
      />
      <FlyTo lot={selected} nonce={props.focusNonce} panelOpen={props.panelOpen} />
      <FlyView
        meta={props.meta}
        zone={props.viewZone}
        nonce={props.viewNonce}
        panelOpen={props.panelOpen}
        skipInitial={props.focusNonce > 0}
      />
      <Labels lots={labelLots} />
      {props.editing && <DrawNew enabled={props.drawing} onCreate={props.onCreate} />}
      {shaping && selected && <VertexEditor lot={selected} onGeometry={props.onGeometry} />}
      <ZoomButtons />
    </MapContainer>
  )
}
