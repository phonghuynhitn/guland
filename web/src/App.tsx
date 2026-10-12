import { useEffect, useMemo, useState } from 'react'
import type { FeatureCollection, Polygon } from 'geojson'
import MapView from './components/MapView'
import LayerPanel, { type BaseLayer } from './components/LayerPanel'
import Legend from './components/Legend'
import ParcelPanel, { type ParcelInfo } from './components/ParcelPanel'
import PriceLegend from './components/PriceLegend'
import type { LotFeature } from './lib/lots'
import { AREA_URL, BOUNDARY_URL, LISTINGS_URL, LOTS_URL, ZONE_URL } from './lib/mapConfig'
import { polygonAreaM2, polygonCentroidLatLng } from './lib/parcel'
import { priceRange, type Listing, type ListingsFile } from './lib/listings'
import { legendFromZones, zoneMix, type AreaMeta, type ZoneFeature } from './lib/zone'

type Tab = 'layers' | 'legend' | 'parcel' | 'price'

export default function App() {
  const [base, setBase] = useState<BaseLayer>('satellite')
  const [showPlanning, setShowPlanning] = useState(true)
  const [showBoundary, setShowBoundary] = useState(true)
  const [showListings, setShowListings] = useState(true)
  const [showLots, setShowLots] = useState(true)
  const [focusLotsNonce, setFocusLotsNonce] = useState(0)
  const [lots, setLots] = useState<LotFeature[]>([])
  const [opacity, setOpacity] = useState(0.45)
  const [area, setArea] = useState<AreaMeta | null>(null)
  const [zones, setZones] = useState<ZoneFeature[]>([])
  const [boundary, setBoundary] = useState<FeatureCollection | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [listings, setListings] = useState<Listing[]>([])
  const [tab, setTab] = useState<Tab>('layers')
  const [open, setOpen] = useState(() => window.innerWidth > 640)
  const [drawing, setDrawing] = useState(false)
  const [drawNonce, setDrawNonce] = useState(0)
  const [parcel, setParcel] = useState<ParcelInfo | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetch(AREA_URL).then((r) => r.json()),
      fetch(ZONE_URL).then((r) => r.json()),
      fetch(BOUNDARY_URL).then((r) => r.json()),
      fetch(LISTINGS_URL).then((r) => r.json()),
    ])
      .then(([meta, zoneFc, boundaryFc, listingsFile]: [AreaMeta, FeatureCollection, FeatureCollection, ListingsFile]) => {
        if (cancelled) return
        setArea(meta)
        setZones((zoneFc.features ?? []) as ZoneFeature[])
        setBoundary(boundaryFc)
        setListings(listingsFile.listings ?? [])
      })
      .catch(() => {
        if (!cancelled) setLoadError('Không tải được vùng quy hoạch Tân Hưng.')
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    fetch(LOTS_URL)
      .then((r) => r.json())
      .then((data: FeatureCollection) => {
        if (!cancelled) setLots((data.features ?? []) as LotFeature[])
      })
      .catch(() => {
        if (!cancelled) setLots([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  const legend = useMemo(() => legendFromZones(zones), [zones])
  const mix = useMemo(() => {
    if (!parcel) return null
    if (zones.length === 0) return 'loading' as const
    return zoneMix(zones, parcel.geometry)
  }, [parcel, zones])

  const { min: priceMin, max: priceMax } = priceRange(listings)

  const onParcelChange = (geometry: Polygon | null) => {
    if (!geometry) {
      setParcel(null)
      return
    }
    setParcel({
      geometry,
      areaM2: polygonAreaM2(geometry),
      centroid: polygonCentroidLatLng(geometry),
    })
    setTab('parcel')
    setOpen(true)
  }

  const startDraw = () => {
    setDrawNonce((n) => n + 1)
    setDrawing(true)
  }

  if (!area || !boundary) {
    return <div className="boot">{loadError ?? 'Đang tải vùng Tân Hưng...'}</div>
  }

  const checkText = area.checks.map((item) => `${item.side}: ${item.edge}`).join(' · ')

  return (
    <div className="app">
      <MapView
        base={base}
        showPlanning={showPlanning}
        showBoundary={showBoundary}
        showListings={showListings}
        opacity={opacity}
        area={area}
        zones={zones}
        boundary={boundary}
        lots={lots}
        showLots={showLots}
        focusLotsNonce={focusLotsNonce}
        panelOpen={open}
        listings={listings}
        priceMin={priceMin}
        priceMax={priceMax}
        drawing={drawing}
        drawNonce={drawNonce}
        onParcelChange={onParcelChange}
        onDrawingChange={setDrawing}
      />

      <aside className={`panel ${open ? 'open' : 'collapsed'}`}>
        <header className="panel-header">
          <button type="button" className="panel-handle" aria-label="Thu gọn hoặc mở panel" onClick={() => setOpen((v) => !v)} />
          <div>
            <h1>{area.title}</h1>
            <p>{area.subtitle}</p>
          </div>
          <button type="button" className="panel-toggle" onClick={() => setOpen((v) => !v)}>
            {open ? 'Thu gọn' : 'Mở'}
          </button>
        </header>

        {open && (
          <>
            <nav className="tabs">
              {(
                [
                  ['layers', 'Lớp'],
                  ['legend', 'Chú giải'],
                  ['parcel', 'Thửa'],
                  ['price', 'Giá'],
                ] as const
              ).map(([id, label]) => (
                <button type="button" key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
                  {label}
                </button>
              ))}
            </nav>

            <div className="panel-body">
              {tab === 'layers' && (
                <>
                  <LayerPanel
                    base={base}
                    onBaseChange={setBase}
                    showPlanning={showPlanning}
                    onShowPlanningChange={setShowPlanning}
                    showBoundary={showBoundary}
                    onShowBoundaryChange={setShowBoundary}
                    showListings={showListings}
                    onShowListingsChange={setShowListings}
                    showLots={showLots}
                    onShowLotsChange={setShowLots}
                    onFocusLots={() => {
                      setShowLots(true)
                      setFocusLotsNonce((n) => n + 1)
                    }}
                    opacity={opacity}
                    onOpacityChange={setOpacity}
                  />
                  <p className="hint">
                    Bấm «Phóng tới các ô đất», rồi bấm một ô viền xanh. Ô được chọn có viền đỏ, kèm số tờ và số thửa
                    giả.{lots.length === 0 ? ' Đang tải ô đất...' : ` Đã có ${lots.length.toLocaleString('vi-VN')} ô.`} Đối chiếu ranh phường: {checkText}.
                  </p>
                </>
              )}
              {tab === 'legend' && <Legend items={legend} />}
              {tab === 'parcel' && (
                <ParcelPanel parcel={parcel} mix={mix} listings={showListings ? listings : []} onStartDraw={startDraw} />
              )}
              {tab === 'price' && <PriceLegend listings={listings} min={priceMin} max={priceMax} />}
            </div>

            <footer className="panel-footer">
              Ranh và màu hiện trạng: OpenStreetMap. Số tờ, số thửa và giá là dữ liệu giả, không có giá trị pháp lý.
            </footer>
          </>
        )}
      </aside>
    </div>
  )
}
