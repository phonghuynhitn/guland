import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import { MapContainer, Marker, Polygon, Popup, ScaleControl, TileLayer, useMap } from 'react-leaflet'
import iconUrl from 'leaflet/dist/images/marker-icon.png'
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png'
import shadowUrl from 'leaflet/dist/images/marker-shadow.png'

const PIN_LAT = 10.737477079512168
const PIN_LNG = 106.46676936659878
const PIN: L.LatLngExpression = [PIN_LAT, PIN_LNG]

const AREA_CORNERS: L.LatLngTuple[] = [
  [10.74591525111054, 106.47371532999577],
  [10.74122460678323, 106.47720484696936],
  [10.732285979256245, 106.45546481528693],
  [10.727642559336095, 106.45914456105865],
]

function ringAround(points: L.LatLngTuple[]): L.LatLngTuple[] {
  const lat = points.reduce((sum, point) => sum + point[0], 0) / points.length
  const lng = points.reduce((sum, point) => sum + point[1], 0) / points.length
  return [...points].sort(
    (a, b) => Math.atan2(a[0] - lat, a[1] - lng) - Math.atan2(b[0] - lat, b[1] - lng),
  )
}

const AREA = ringAround(AREA_CORNERS)

const pinIcon = L.icon({
  iconUrl,
  iconRetinaUrl,
  shadowUrl,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
})

function ClickLogger({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  const map = useMap()
  const onPickRef = useRef(onPick)
  useEffect(() => {
    onPickRef.current = onPick
  }, [onPick])

  useEffect(() => {
    const container = map.getContainer()
    const onClick = (event: MouseEvent) => {
      const target = event.target
      if (target instanceof Element && target.closest('.leaflet-control')) return
      const latlng = map.mouseEventToLatLng(event)
      console.log(latlng.lat, latlng.lng)
      onPickRef.current(latlng.lat, latlng.lng)
    }
    container.addEventListener('click', onClick, true)
    return () => container.removeEventListener('click', onClick, true)
  }, [map])

  return null
}

function FitArea() {
  const map = useMap()
  useEffect(() => {
    map.fitBounds(L.latLngBounds(AREA), { padding: [32, 32] })
  }, [map])
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

function PinnedMarker() {
  const markerRef = useRef<L.Marker>(null)

  useEffect(() => {
    markerRef.current?.openPopup()
  }, [])

  return (
    <Marker ref={markerRef} position={PIN} icon={pinIcon}>
      <Popup>
        TDL Scale Model
        <br />
        {PIN_LAT}, {PIN_LNG}
      </Popup>
    </Marker>
  )
}

export default function TdlScaleModelPage() {
  const [picked, setPicked] = useState<{ lat: number; lng: number } | null>(null)

  useEffect(() => {
    const previous = document.title
    document.title = 'TDL Scale Model'
    return () => {
      document.title = previous
    }
  }, [])

  return (
    <div className="app">
      <MapContainer className="map" center={PIN} zoom={18} minZoom={3} maxZoom={21} zoomControl={false}>
        <TileLayer
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          attribution="Ảnh vệ tinh &copy; Esri, Maxar, Earthstar Geographics"
          maxNativeZoom={19}
          maxZoom={21}
        />
        <Polygon
          positions={AREA}
          interactive={false}
          pathOptions={{ color: '#ffffff', weight: 2, fillColor: '#f59e0b', fillOpacity: 0.4 }}
        />
        <FitArea />
        <PinnedMarker />
        <ClickLogger onPick={(lat, lng) => setPicked({ lat, lng })} />
        <ZoomControl />
        <ScaleControl position="bottomleft" imperial={false} />
      </MapContainer>
      {picked && (
        <div className="tdl-click-log">
          {picked.lat}, {picked.lng}
        </div>
      )}
    </div>
  )
}
