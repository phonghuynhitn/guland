import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import L from 'leaflet'
import { MapContainer, Marker, Polygon, ScaleControl, TileLayer, useMap } from 'react-leaflet'
import {
  CORNER_LABELS,
  PIN_LAT,
  PIN_LNG,
  TDL_AREA_IMAGE_URL,
  areaImageQuad,
  areaOutlineRing,
  formatCornersForConfig,
  GOOGLE_SATELLITE_TILE,
  GOOGLE_TILE_SUBDOMAINS,
} from '../lib/tdlScaleModelConfig'
import { QuadWarpLayer, createQuadImageLayer, type GeoCorners } from '../lib/tdlQuadImageLayer'

const PIN: L.LatLngExpression = [PIN_LAT, PIN_LNG]

const CORNER_COLORS = ['#0f766e', '#1d4ed8', '#b45309', '#be123c']

function cornerIcon(label: string, color: string) {
  return L.divIcon({
    className: 'tdl-corner-handle',
    html: `<span style="background:${color}">${label}</span>`,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
  })
}

function ClickLogger({ enabled, onPick }: { enabled: boolean; onPick: (lat: number, lng: number) => void }) {
  const map = useMap()
  const onPickRef = useRef(onPick)
  const enabledRef = useRef(enabled)
  useEffect(() => {
    onPickRef.current = onPick
  }, [onPick])
  useEffect(() => {
    enabledRef.current = enabled
  }, [enabled])

  useEffect(() => {
    const container = map.getContainer()
    const onClick = (event: MouseEvent) => {
      if (!enabledRef.current) return
      const target = event.target
      if (target instanceof Element && target.closest('.leaflet-control, .tdl-corner-handle')) return
      const latlng = map.mouseEventToLatLng(event)
      console.log(latlng.lat, latlng.lng)
      onPickRef.current(latlng.lat, latlng.lng)
    }
    container.addEventListener('click', onClick, true)
    return () => container.removeEventListener('click', onClick, true)
  }, [map])

  return null
}

function FitScene({ corners }: { corners: GeoCorners }) {
  const map = useMap()
  const fitted = useRef(false)
  useEffect(() => {
    if (fitted.current) return
    fitted.current = true
    map.fitBounds(L.latLngBounds(corners), { padding: [32, 32] })
  }, [map, corners])
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

function AreaPlanImage({ corners, layerRef }: { corners: GeoCorners; layerRef: RefObject<QuadWarpLayer | null> }) {
  const map = useMap()

  useEffect(() => {
    const layer = createQuadImageLayer(TDL_AREA_IMAGE_URL, corners, 1)
    layerRef.current = layer
    layer.addTo(map)
    return () => {
      layer.remove()
      layerRef.current = null
    }
  }, [map, layerRef])

  useEffect(() => {
    layerRef.current?.setCorners(corners)
  }, [corners, layerRef])

  return null
}

function CornerHandles({
  corners,
  editMode,
  onMove,
}: {
  corners: GeoCorners
  editMode: boolean
  onMove: (index: number, lat: number, lng: number) => void
}) {
  if (!editMode) return null
  return (
    <>
      {corners.map(([lat, lng], index) => (
        <Marker
          key={CORNER_LABELS[index]}
          position={[lat, lng]}
          draggable
          zIndexOffset={1200}
          icon={cornerIcon(['TL', 'TR', 'BR', 'BL'][index], CORNER_COLORS[index])}
          eventHandlers={{
            drag(event) {
              const { lat: nextLat, lng: nextLng } = event.target.getLatLng()
              onMove(index, nextLat, nextLng)
            },
          }}
        />
      ))}
    </>
  )
}

export default function TdlScaleModelPage() {
  const [corners, setCorners] = useState<GeoCorners>(() => areaImageQuad())
  const [editMode, setEditMode] = useState(true)
  const [picked, setPicked] = useState<{ lat: number; lng: number } | null>(null)
  const [imageError, setImageError] = useState(false)
  const [copyHint, setCopyHint] = useState<string | null>(null)
  const layerRef = useRef<QuadWarpLayer | null>(null)

  const configSnippet = useMemo(() => formatCornersForConfig(corners), [corners])
  const outline = useMemo(() => areaOutlineRing(corners), [corners])

  useEffect(() => {
    const previous = document.title
    document.title = 'TDL Scale Model'
    return () => {
      document.title = previous
    }
  }, [])

  useEffect(() => {
    const image = new Image()
    image.onerror = () => setImageError(true)
    image.src = TDL_AREA_IMAGE_URL
  }, [])

  const moveCorner = (index: number, lat: number, lng: number) => {
    setCorners((current) => {
      const next = current.map((point, i) => (i === index ? [lat, lng] : point)) as GeoCorners
      return next
    })
  }

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(configSnippet)
      setCopyHint('Đã copy vào clipboard')
    } catch {
      setCopyHint('Không copy được — chọn text trong khung bên dưới')
    }
  }

  return (
    <div className="app">
      <MapContainer className="map" center={PIN} zoom={18} minZoom={3} maxZoom={21} zoomControl={false}>
        <TileLayer
          url={GOOGLE_SATELLITE_TILE}
          subdomains={[...GOOGLE_TILE_SUBDOMAINS]}
          attribution="&copy; Google"
          maxNativeZoom={21}
          maxZoom={21}
        />
        <AreaPlanImage corners={corners} layerRef={layerRef} />
        <Polygon
          positions={outline}
          interactive={false}
          pathOptions={{ color: '#ffffff', weight: 2, fillOpacity: 0, opacity: 0.85 }}
        />
        <CornerHandles corners={corners} editMode={editMode} onMove={moveCorner} />
        <FitScene corners={corners} />
        <ClickLogger enabled={!editMode} onPick={(lat, lng) => setPicked({ lat, lng })} />
        <ZoomControl />
        <ScaleControl position="bottomleft" imperial={false} />
      </MapContainer>

      <aside className="tdl-editor-panel">
        <header className="tdl-editor-header">
          <strong>Chỉnh khớp mặt bằng</strong>
          <button type="button" className="tdl-editor-toggle" onClick={() => setEditMode((v) => !v)}>
            {editMode ? 'Xong chỉnh góc' : 'Kéo 4 góc'}
          </button>
        </header>
        <p className="tdl-editor-hint">
          {editMode
            ? 'Kéo 4 nút TL / TR / BR / BL trên bản đồ. Ảnh và viền trắng cập nhật theo thời gian thực.'
            : 'Bấm bản đồ để log tọa độ (console). Bật lại «Kéo 4 góc» để chỉnh ảnh.'}
        </p>
        {imageError && <p className="tdl-editor-error">Không tải được mặt bằng area.png</p>}
        <ul className="tdl-corner-list">
          {corners.map(([lat, lng], index) => (
            <li key={CORNER_LABELS[index]}>
              <span className="tdl-corner-label">{CORNER_LABELS[index]}</span>
              <code>
                {lat}, {lng}
              </code>
            </li>
          ))}
        </ul>
        <textarea className="tdl-config-snippet" readOnly rows={5} value={configSnippet} aria-label="Tọa độ copy vào config" />
        <button type="button" className="tdl-copy-btn" onClick={() => void onCopy()}>
          Copy vào clipboard
        </button>
        {copyHint && <p className="tdl-copy-hint">{copyHint}</p>}
      </aside>

      {picked && !editMode && (
        <div className="tdl-click-log tdl-click-log--coords">
          {picked.lat}, {picked.lng}
        </div>
      )}
    </div>
  )
}