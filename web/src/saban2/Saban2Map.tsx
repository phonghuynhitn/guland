import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import { MapContainer, useMap, useMapEvents } from 'react-leaflet'
import type { FeatureCollection } from 'geojson'
import { lotBounds, planImageUrl, type LotFeature, type PlanMeta } from './model'

const MOBILE = 640

type Props = {
  meta: PlanMeta
  lots: LotFeature[]
  selectedId: string | null
  focusNonce: number
  panelOpen: boolean
  onSelect: (id: string) => void
}

function padding(map: L.Map, panelOpen: boolean) {
  const mobile = map.getSize().x <= MOBILE
  if (mobile) {
    return {
      paddingTopLeft: L.point(16, 16),
      paddingBottomRight: L.point(16, panelOpen ? 280 : 72),
    }
  }
  return {
    paddingTopLeft: L.point(panelOpen ? 400 : 24, 24),
    paddingBottomRight: L.point(24, 24),
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

function LotLayer({ lots, selectedId, onSelect }: { lots: LotFeature[]; selectedId: string | null; onSelect: (id: string) => void }) {
  const map = useMap()
  const [renderer] = useState(() => L.canvas({ padding: 0.5 }))
  const onSelectRef = useRef(onSelect)
  useEffect(() => {
    onSelectRef.current = onSelect
  })

  useEffect(() => {
    const features = lots.filter((lot) => lot.properties.closed && lot.properties.id !== selectedId)
    const collection: FeatureCollection = { type: 'FeatureCollection', features }
    const layer = L.geoJSON(collection, {
      renderer,
      style: {
        color: '#0f766e',
        weight: 1.5,
        fillColor: '#0f766e',
        fillOpacity: 0.16,
        opacity: 0.9,
      },
      onEachFeature: (feature, path) => {
        path.on('click', () => onSelectRef.current((feature as LotFeature).properties.id))
      },
    } as L.GeoJSONOptions)
    layer.addTo(map)
    return () => {
      layer.remove()
    }
  }, [lots, selectedId, map, renderer])

  return null
}

function Highlight({ lot }: { lot: LotFeature | null }) {
  const map = useMap()
  useEffect(() => {
    if (!lot) return
    if (lot.geometry.type === 'Point') {
      const [x, y] = lot.geometry.coordinates
      const marker = L.circleMarker([y, x], {
        radius: 7,
        color: '#b45309',
        weight: 2,
        fillColor: '#f59e0b',
        fillOpacity: 0.9,
      })
      marker.addTo(map)
      return () => {
        marker.remove()
      }
    }
    const layer = L.geoJSON(lot, {
      interactive: false,
      style: { color: '#b91c1c', weight: 3, fillColor: '#b91c1c', fillOpacity: 0.28 },
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

function FitPlan({ meta, panelOpen }: { meta: PlanMeta; panelOpen: boolean }) {
  const map = useMap()
  const fitted = useRef(false)
  useEffect(() => {
    if (fitted.current) return
    fitted.current = true
    map.invalidateSize()
    map.fitBounds(
      [
        [0, 0],
        [meta.height, meta.width],
      ],
      padding(map, panelOpen),
    )
  }, [map, meta, panelOpen])
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
      if (!lot.properties.closed || shown >= 90) continue
      const [[south, west], [north, east]] = lotBounds(lot)
      if (!bounds.intersects(L.latLngBounds([south, west], [north, east]))) continue
      const size = Math.max(east - west, north - south) * scale
      if (size < 34) continue
      L.marker([(south + north) / 2, (west + east) / 2], {
        interactive: false,
        icon: L.divIcon({
          className: 'lot-label',
          html: lot.properties.code,
          iconSize: [48, 16],
          iconAnchor: [24, 8],
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

export default function Saban2Map({ meta, lots, selectedId, focusNonce, panelOpen, onSelect }: Props) {
  const selected = lots.find((lot) => lot.properties.id === selectedId) ?? null
  return (
    <MapContainer
      className="plan-map"
      crs={L.CRS.Simple}
      center={[meta.height / 2, meta.width / 2]}
      zoom={-2}
      minZoom={-5}
      maxZoom={3}
      zoomSnap={0.25}
      zoomControl={false}
      attributionControl={false}
      maxBounds={L.latLngBounds([-meta.height * 0.25, -meta.width * 0.25], [meta.height * 1.25, meta.width * 1.25])}
      maxBoundsViscosity={0.85}
    >
      <ImageLayer meta={meta} />
      <LotLayer lots={lots} selectedId={selectedId} onSelect={onSelect} />
      <Highlight lot={selected} />
      <Labels lots={lots} />
      <FitPlan meta={meta} panelOpen={panelOpen} />
      <FlyTo lot={selected} nonce={focusNonce} panelOpen={panelOpen} />
      <ZoomButtons />
    </MapContainer>
  )
}
