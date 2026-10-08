import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import type { FeatureCollection, Polygon } from 'geojson'
import { GeoJSON, MapContainer, Popup, ScaleControl, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import { getArchive, PmtilesRasterLayer } from '../lib/pmtilesLayer'
import { sampleLandUse, type LegendItem } from '../lib/landUse'
import { wgs84ToVn2000 } from '../lib/vn2000'
import { DISTRICT_URL, PLANNING_URL } from '../lib/mapConfig'
import type { Listing } from '../lib/listings'
import type { BaseLayer } from './LayerPanel'
import DrawControl from './DrawControl'
import PriceLayer from './PriceLayer'

const CENTER: L.LatLngTuple = [21.0297, 105.7903]
const PLANNING_BOUNDS = L.latLngBounds([21.000154, 105.766616], [21.059293, 105.814054])
const MAX_BOUNDS = L.latLngBounds([20.85, 105.55], [21.2, 106.05])
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

type Props = {
  base: BaseLayer
  showPlanning: boolean
  showBoundary: boolean
  showListings: boolean
  opacity: number
  legend: LegendItem[]
  panelOpen: boolean
  listings: Listing[]
  priceMin: number
  priceMax: number
  drawing: boolean
  drawNonce: number
  onParcelChange: (geometry: Polygon | null) => void
  onDrawingChange: (drawing: boolean) => void
}

function PlanningLayer({ visible, opacity }: { visible: boolean; opacity: number }) {
  const map = useMap()
  const layerRef = useRef<PmtilesRasterLayer | null>(null)

  useEffect(() => {
    const layer = new PmtilesRasterLayer(PLANNING_URL, {
      minZoom: 12,
      maxNativeZoom: 18,
      maxZoom: 21,
      zIndex: 10,
      bounds: PLANNING_BOUNDS,
    })
    layerRef.current = layer
    return () => {
      layer.remove()
      layerRef.current = null
    }
  }, [])

  useEffect(() => {
    const layer = layerRef.current
    if (!layer) return
    if (visible) layer.addTo(map)
    else layer.remove()
  }, [map, visible])

  useEffect(() => {
    layerRef.current?.setOpacity(opacity)
  }, [opacity])

  return null
}

type Picked = {
  latlng: L.LatLng
  landUse: LegendItem[] | null | 'loading'
}

function ClickInfo({
  legend,
  showPlanning,
  panelOpen,
  drawing,
}: {
  legend: LegendItem[]
  showPlanning: boolean
  panelOpen: boolean
  drawing: boolean
}) {
  const [picked, setPicked] = useState<Picked | null>(null)
  const map = useMap()
  const isMobile = map.getContainer().clientWidth <= MOBILE_BREAKPOINT

  useMapEvents({
    click(e) {
      if (drawing) return
      const latlng = e.latlng
      setPicked({ latlng, landUse: showPlanning ? 'loading' : null })
      if (!showPlanning) return
      sampleLandUse(getArchive(PLANNING_URL), legend, latlng.lat, latlng.lng)
        .then((landUse) => setPicked((p) => (p?.latlng === latlng ? { latlng, landUse } : p)))
        .catch(() => setPicked((p) => (p?.latlng === latlng ? { latlng, landUse: null } : p)))
    },
  })

  useEffect(() => {
    if (drawing) setPicked(null)
  }, [drawing])

  if (!picked) return null
  const { lat, lng } = picked.latlng
  const vn = wgs84ToVn2000(lat, lng)

  return (
    <Popup
      position={picked.latlng}
      autoPanPaddingTopLeft={
        isMobile ? [16, 16] : [panelOpen ? PANEL_WIDTH + 16 : 16, panelOpen ? 16 : COLLAPSED_HEADER_HEIGHT]
      }
      autoPanPaddingBottomRight={isMobile ? [16, MOBILE_SHEET_HEIGHT] : [16, 16]}
      eventHandlers={{ remove: () => setPicked(null) }}
    >
      <div className="popup">
        <LandUseInfo landUse={picked.landUse} />
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
        <p className="popup-note">VN-2000 múi 3°, kinh tuyến trục 105°00'</p>
      </div>
    </Popup>
  )
}

function LandUseInfo({ landUse }: { landUse: Picked['landUse'] }) {
  if (landUse === 'loading') return <p className="popup-muted">Đang đọc quy hoạch...</p>
  if (landUse === null) return <p className="popup-muted">Ngoài vùng có dữ liệu quy hoạch</p>
  if (landUse.length === 0) return <p className="popup-muted">Không xác định được loại đất tại điểm này</p>

  const [first] = landUse
  return (
    <div className="popup-landuse">
      <span className="swatch" style={{ background: first.color }} />
      <div>
        {landUse.length === 1 ? (
          <strong>
            {first.code} - {first.name}
          </strong>
        ) : (
          <>
            <strong>Nhóm đất cùng màu</strong>
            <div className="popup-codes">{landUse.map((i) => i.code).join(', ')}</div>
          </>
        )}
      </div>
    </div>
  )
}

function DistrictBoundary() {
  const [data, setData] = useState<FeatureCollection | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    fetch(DISTRICT_URL, { signal: controller.signal })
      .then((r) => r.json())
      .then(setData)
      .catch(() => {})
    return () => controller.abort()
  }, [])

  if (!data) return null
  return (
    <GeoJSON
      data={data}
      interactive={false}
      style={{ color: '#e11d48', weight: 3, dashArray: '8 6', fill: false }}
    />
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
  legend,
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

  return (
    <MapContainer
      className="map"
      center={CENTER}
      zoom={14}
      minZoom={12}
      maxZoom={21}
      maxBounds={MAX_BOUNDS}
      maxBoundsViscosity={0.8}
      zoomControl={false}
    >
      <TileLayer
        key={base}
        url={baseLayer.url}
        attribution={baseLayer.attribution}
        maxNativeZoom={baseLayer.maxNativeZoom}
        maxZoom={21}
      />
      <PlanningLayer visible={showPlanning} opacity={opacity} />
      {showBoundary && <DistrictBoundary />}
      {showListings && <PriceLayer listings={listings} min={priceMin} max={priceMax} />}
      <DrawControl onParcelChange={onParcelChange} onDrawingChange={onDrawingChange} />
      <StartDraw nonce={drawNonce} />
      <ClickInfo legend={legend} showPlanning={showPlanning} panelOpen={panelOpen} drawing={drawing} />
      <ZoomControl />
      <FitDistrict panelOpen={panelOpen} />
      <ScaleControl position="bottomleft" imperial={false} />
    </MapContainer>
  )
}

function FitDistrict({ panelOpen }: { panelOpen: boolean }) {
  const map = useMap()
  useEffect(() => {
    const isMobile = map.getContainer().clientWidth <= MOBILE_BREAKPOINT
    map.invalidateSize()
    map.fitBounds(PLANNING_BOUNDS, {
      paddingTopLeft: isMobile
        ? [16, 16]
        : [panelOpen ? PANEL_WIDTH + 16 : 16, panelOpen ? 16 : COLLAPSED_HEADER_HEIGHT],
      paddingBottomRight: isMobile ? [16, MOBILE_SHEET_HEIGHT] : [16, 16],
    })
  }, [map, panelOpen])
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
