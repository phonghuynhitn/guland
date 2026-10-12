import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import type { FeatureCollection, Polygon } from 'geojson'
import { GeoJSON, MapContainer, Popup, ScaleControl, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import { LOT_STYLE, MIN_LOT_ZOOM, lotBoxes, lotsInBounds, type LotFeature } from '../lib/lots'
import { VN2000_MERIDIAN_LABEL, wgs84ToVn2000 } from '../lib/vn2000'
import { pickZone, type AreaMeta, type ZoneFeature } from '../lib/zone'
import type { Listing } from '../lib/listings'
import type { BaseLayer } from './LayerPanel'
import DrawControl from './DrawControl'
import PriceLayer from './PriceLayer'

const MOBILE_BREAKPOINT = 640
const PANEL_WIDTH = 340 + 16
const COLLAPSED_HEADER_HEIGHT = 88
const MOBILE_SHEET_HEIGHT = 110

const BASE_LAYERS: Record<BaseLayer, { url: string; attribution: string; maxNativeZoom: number }> = {
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Ảnh vệ tinh &copy; Esri, Maxar, Earthstar Geographics',
    maxNativeZoom: 19,
  },
  streets: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Bản đồ nền &copy; Esri, HERE, Garmin, &copy; OpenStreetMap contributors',
    maxNativeZoom: 19,
  },
}

type Pick =
  | { latlng: L.LatLng; status: 'zone'; zone: ZoneFeature }
  | { latlng: L.LatLng; status: 'lot'; lot: LotFeature }
  | { latlng: L.LatLng; status: 'outside' }
  | { latlng: L.LatLng; status: 'hidden' }

type Props = {
  base: BaseLayer
  showPlanning: boolean
  showBoundary: boolean
  showListings: boolean
  opacity: number
  area: AreaMeta
  zones: ZoneFeature[]
  boundary: FeatureCollection
  lots: LotFeature[]
  showLots: boolean
  focusLotsNonce: number
  panelOpen: boolean
  listings: Listing[]
  priceMin: number
  priceMax: number
  drawing: boolean
  drawNonce: number
  onParcelChange: (geometry: Polygon | null) => void
  onDrawingChange: (drawing: boolean) => void
}

function EnsurePanes() {
  const map = useMap()
  if (!map.getPane('planning')) {
    const pane = map.createPane('planning')
    pane.style.zIndex = '350'
  }
  if (!map.getPane('planning-edge')) {
    const pane = map.createPane('planning-edge')
    pane.style.zIndex = '370'
  }
  if (!map.getPane('parcels')) {
    const pane = map.createPane('parcels')
    pane.style.zIndex = '390'
  }
  if (!map.getPane('parcels-select')) {
    const pane = map.createPane('parcels-select')
    pane.style.zIndex = '395'
    pane.style.pointerEvents = 'none'
  }
  return null
}

function ZoneFill({
  zones,
  opacity,
  drawing,
  onPick,
}: {
  zones: ZoneFeature[]
  opacity: number
  drawing: boolean
  onPick: (pick: Pick) => void
}) {
  const layerRef = useRef<L.GeoJSON | null>(null)
  const drawingRef = useRef(drawing)
  useEffect(() => {
    drawingRef.current = drawing
  }, [drawing])
  const data = useMemo<FeatureCollection>(() => ({ type: 'FeatureCollection', features: zones }), [zones])

  useEffect(() => {
    layerRef.current?.setStyle((feature) => ({
      stroke: false,
      fillColor: feature?.properties?.color ?? '#cccccc',
      fillOpacity: opacity,
    }))
  }, [opacity])

  return (
    <GeoJSON
      ref={layerRef}
      data={data}
      pane="planning"
      interactive={!drawing}
      style={(feature) => ({
        stroke: false,
        fillColor: feature?.properties?.color ?? '#cccccc',
        fillOpacity: opacity,
      })}
      onEachFeature={(feature, layer) => {
        ;(layer as L.Polyline).options.smoothFactor = 0
        layer.on('click', (event) => {
          if (drawingRef.current) return
          L.DomEvent.stopPropagation(event)
          onPick({ latlng: event.latlng, status: 'zone', zone: feature as ZoneFeature })
        })
      }}
    />
  )
}

function BoundaryLine({ data, halo }: { data: FeatureCollection; halo: boolean }) {
  return (
    <GeoJSON
      data={data}
      pane="planning-edge"
      interactive={false}
      style={{
        color: halo ? '#ffffff' : '#e11d48',
        weight: halo ? 7 : 2.5,
        opacity: halo ? 0.95 : 1,
        fill: false,
        lineJoin: 'round',
        lineCap: 'round',
      }}
      onEachFeature={(_feature, layer) => {
        ;(layer as L.Polyline).options.smoothFactor = 0
      }}
    />
  )
}

function LotLayer({
  lots,
  show,
  drawing,
  onPick,
}: {
  lots: LotFeature[]
  show: boolean
  drawing: boolean
  onPick: (lot: LotFeature, latlng: L.LatLng) => void
}) {
  const map = useMap()
  const layerRef = useRef<L.GeoJSON | null>(null)
  const boxes = useMemo(() => lotBoxes(lots), [lots])
  const onPickRef = useRef(onPick)
  const drawingRef = useRef(drawing)
  const showRef = useRef(show)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    onPickRef.current = onPick
  }, [onPick])
  useEffect(() => {
    drawingRef.current = drawing
  }, [drawing])
  useEffect(() => {
    showRef.current = show
  }, [show])

  useEffect(() => {
    const layer = L.geoJSON(undefined, {
      pane: 'parcels',
      renderer: L.canvas({ pane: 'parcels', padding: 0.3 }),
      style(feature) {
        const code = feature?.properties?.code as string | undefined
        return {
          color: '#1d4ed8',
          weight: 1.75,
          opacity: 1,
          fillColor: LOT_STYLE[code ?? '']?.color ?? LOT_STYLE.HH.color,
          fillOpacity: 0.46,
        }
      },
      onEachFeature(feature, path) {
        path.on('click', (event) => {
          if (drawingRef.current || !showRef.current) return
          L.DomEvent.stopPropagation(event)
          onPickRef.current(feature as LotFeature, event.latlng)
        })
      },
    } as L.GeoJSONOptions)
    layer.addTo(map)
    layerRef.current = layer
    return () => {
      layer.remove()
      layerRef.current = null
    }
  }, [map])

  useMapEvents({
    moveend() {
      setTick((n) => n + 1)
    },
    zoomend() {
      setTick((n) => n + 1)
    },
  })

  useEffect(() => {
    const layer = layerRef.current
    if (!layer) return
    const pane = map.getPane('parcels')
    if (pane) pane.style.pointerEvents = show && !drawing ? 'auto' : 'none'
    layer.clearLayers()
    if (!show || drawing || lots.length === 0 || map.getZoom() < MIN_LOT_ZOOM) return
    const bounds = map.getBounds().pad(0.15)
    const visible = lotsInBounds(lots, boxes, bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth())
    if (visible.length > 0) {
      const collection: FeatureCollection = { type: 'FeatureCollection', features: visible }
      layer.addData(collection)
    }
  }, [lots, boxes, show, drawing, tick, map])

  return null
}

function LotHighlight({ lot }: { lot: LotFeature | null }) {
  const map = useMap()
  const [zoom, setZoom] = useState(() => map.getZoom())
  useMapEvents({
    zoomend() {
      setZoom(map.getZoom())
    },
  })
  const visible = lot && zoom >= MIN_LOT_ZOOM ? lot : null
  useEffect(() => {
    if (!visible) return
    const layer = L.geoJSON(visible, {
      pane: 'parcels-select',
      interactive: false,
      style: { color: '#dc2626', weight: 3, fillColor: '#dc2626', fillOpacity: 0.22 },
    })
    layer.addTo(map)
    return () => {
      layer.remove()
    }
  }, [visible, map])
  return null
}

function FlyToLots({ nonce, center }: { nonce: number; center: [number, number] }) {
  const map = useMap()
  useEffect(() => {
    if (!nonce) return
    map.flyTo(center, 18, { duration: 0.7 })
  }, [nonce, map, center])
  return null
}

function MapClicks({
  zones,
  showPlanning,
  drawing,
  onPick,
}: {
  zones: ZoneFeature[]
  showPlanning: boolean
  drawing: boolean
  onPick: (pick: Pick) => void
}) {
  useMapEvents({
    click(event) {
      if (drawing) return
      if (!showPlanning) {
        onPick({ latlng: event.latlng, status: 'hidden' })
        return
      }
      const zone = pickZone(zones, event.latlng.lat, event.latlng.lng)
      onPick(
        zone
          ? { latlng: event.latlng, status: 'zone', zone }
          : { latlng: event.latlng, status: 'outside' },
      )
    },
  })
  return null
}

function ClickPopup({
  picked,
  panelOpen,
  onClose,
}: {
  picked: Pick | null
  panelOpen: boolean
  onClose: (latlng: L.LatLng) => void
}) {
  const map = useMap()
  if (!picked) return null
  const { lat, lng } = picked.latlng
  const vn = wgs84ToVn2000(lat, lng)
  const isMobile = map.getContainer().clientWidth <= MOBILE_BREAKPOINT

  return (
    <Popup
      position={picked.latlng}
      autoPanPaddingTopLeft={
        isMobile ? [16, 16] : [panelOpen ? PANEL_WIDTH + 16 : 16, panelOpen ? 16 : COLLAPSED_HEADER_HEIGHT]
      }
      autoPanPaddingBottomRight={isMobile ? [16, MOBILE_SHEET_HEIGHT] : [16, 16]}
      eventHandlers={{ remove: () => onClose(picked.latlng) }}
    >
      <div className="popup">
        <ZoneInfo picked={picked} />
        <table>
          <tbody>
            <tr>
              <th>WGS84</th>
              <td>
                {lat.toFixed(6)}, {lng.toFixed(6)}
              </td>
            </tr>
            <tr>
              <th>VN-2000</th>
              <td>
                X {vn.x.toFixed(2)}
                <br />Y {vn.y.toFixed(2)}
              </td>
            </tr>
          </tbody>
        </table>
        <p className="popup-note">VN-2000 múi 3°, kinh tuyến trục {VN2000_MERIDIAN_LABEL} (TP.HCM)</p>
      </div>
    </Popup>
  )
}

function ZoneInfo({ picked }: { picked: Pick }) {
  if (picked.status === 'hidden') return <p className="popup-muted">Đang tắt lớp quy hoạch</p>
  if (picked.status === 'outside') return <p className="popup-muted">Ngoài vùng quy hoạch phường Tân Hưng</p>
  if (picked.status === 'lot') {
    const lot = picked.lot.properties
    const style = LOT_STYLE[lot.code] ?? LOT_STYLE.HH
    const area = lot.areaM2.toLocaleString('vi-VN', { maximumFractionDigits: 2 })
    return (
      <>
        <div className="popup-lot">
          <strong>
            Tờ {lot.soTo} Thửa {lot.soThua}
          </strong>
          <p>Diện tích: {area} m²</p>
          <p className="popup-muted">{lot.address}</p>
        </div>
        <div className="popup-landuse">
          <span className="swatch" style={{ background: style.color }} />
          <div>
            <strong>
              {lot.code} — {style.name}
            </strong>
          </div>
        </div>
        <p className="popup-note">Số tờ, số thửa là dữ liệu giả để demo, không phải hồ sơ địa chính.</p>
      </>
    )
  }
  const { code, name, color } = picked.zone.properties
  return (
    <div className="popup-landuse">
      <span className="swatch" style={{ background: color }} />
      <div>
        <strong>
          {code} — {name}
        </strong>
        <div className="popup-codes">Trong ranh phường Tân Hưng</div>
      </div>
    </div>
  )
}

function StartDraw({ nonce }: { nonce: number }) {
  const map = useMap()
  useEffect(() => {
    if (!nonce) return
    map.pm.enableDraw('Polygon')
  }, [map, nonce])
  return null
}

export default function MapView({
  base,
  showPlanning,
  showBoundary,
  showListings,
  opacity,
  area,
  zones,
  boundary,
  lots,
  showLots,
  focusLotsNonce,
  panelOpen,
  listings,
  priceMin,
  priceMax,
  drawing,
  drawNonce,
  onParcelChange,
  onDrawingChange,
}: Props) {
  const baseLayer = BASE_LAYERS[base]
  const [picked, setPicked] = useState<Pick | null>(null)
  const [selectedLot, setSelectedLot] = useState<LotFeature | null>(null)
  const [south, west, north, east] = area.bounds
  const closePick = (latlng: L.LatLng) => {
    setPicked((current) => (current && current.latlng.equals(latlng) ? null : current))
  }
  const handleDrawingChange = (value: boolean) => {
    onDrawingChange(value)
    if (value) {
      setPicked(null)
      setSelectedLot(null)
    }
  }
  const pickLot = (lot: LotFeature, latlng: L.LatLng) => {
    setSelectedLot(lot)
    setPicked({ latlng, status: 'lot', lot })
  }
  const pickMap = (pick: Pick) => {
    setSelectedLot(null)
    setPicked(pick)
  }

  return (
    <MapContainer
      className="map"
      center={area.center}
      zoom={15}
      minZoom={13}
      maxZoom={21}
      maxBounds={L.latLngBounds([south - 0.02, west - 0.02], [north + 0.02, east + 0.02])}
      maxBoundsViscosity={0.85}
      zoomControl={false}
    >
      <TileLayer
        key={base}
        url={baseLayer.url}
        attribution={baseLayer.attribution}
        maxNativeZoom={baseLayer.maxNativeZoom}
        maxZoom={21}
      />
      <EnsurePanes />
      {showPlanning && <ZoneFill zones={zones} opacity={opacity} drawing={drawing} onPick={pickMap} />}
      {showBoundary && <BoundaryLine data={boundary} halo />}
      {showBoundary && <BoundaryLine data={boundary} halo={false} />}
      <LotLayer lots={lots} show={showLots} drawing={drawing} onPick={pickLot} />
      <LotHighlight lot={showLots && !drawing ? selectedLot : null} />
      <FlyToLots nonce={focusLotsNonce} center={area.center} />
      {showListings && <PriceLayer listings={listings} min={priceMin} max={priceMax} />}
      <DrawControl onParcelChange={onParcelChange} onDrawingChange={handleDrawingChange} />
      <StartDraw nonce={drawNonce} />
      <MapClicks zones={zones} showPlanning={showPlanning} drawing={drawing} onPick={pickMap} />
      <ClickPopup picked={picked} panelOpen={panelOpen} onClose={closePick} />
      <ZoomControl />
      <FitDistrict area={area} panelOpen={panelOpen} />
      <ScaleControl position="bottomleft" imperial={false} />
    </MapContainer>
  )
}

function FitDistrict({ area, panelOpen }: { area: AreaMeta; panelOpen: boolean }) {
  const map = useMap()
  const [south, west, north, east] = area.bounds
  useEffect(() => {
    const isMobile = map.getContainer().clientWidth <= MOBILE_BREAKPOINT
    map.invalidateSize()
    map.fitBounds(L.latLngBounds([south, west], [north, east]), {
      paddingTopLeft: isMobile
        ? [24, 24]
        : [panelOpen ? PANEL_WIDTH + 24 : 24, panelOpen ? 24 : COLLAPSED_HEADER_HEIGHT],
      paddingBottomRight: isMobile ? [24, MOBILE_SHEET_HEIGHT] : [24, 24],
    })
  }, [map, panelOpen, south, west, north, east])
  return null
}

function ZoomControl() {
  const map = useMap()
  useEffect(() => {
    const control = L.control.zoom({ position: 'bottomright' }).addTo(map)
    return () => {
      control.remove()
    }
  }, [map])
  return null
}
