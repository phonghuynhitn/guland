import { useEffect, useState } from 'react'
import type { Polygon } from 'geojson'
import MapView from './components/MapView'
import LayerPanel, { type BaseLayer } from './components/LayerPanel'
import Legend from './components/Legend'
import ParcelPanel, { type ParcelInfo } from './components/ParcelPanel'
import PriceLegend from './components/PriceLegend'
import { getArchive } from './lib/pmtilesLayer'
import { sampleLandUseMix, type LandUseShare, type LegendItem } from './lib/landUse'
import { PLANNING_URL, LISTINGS_URL, LEGEND_URL } from './lib/mapConfig'
import { gridInsidePolygon, polygonAreaM2, polygonCentroidLatLng } from './lib/parcel'
import { priceRange, type Listing, type ListingsFile } from './lib/listings'

type Tab = 'layers' | 'legend' | 'parcel' | 'price'

export default function App() {
  const [base, setBase] = useState<BaseLayer>('satellite')
  const [showPlanning, setShowPlanning] = useState(true)
  const [showBoundary, setShowBoundary] = useState(true)
  const [showListings, setShowListings] = useState(true)
  const [opacity, setOpacity] = useState(0.6)
  const [legend, setLegend] = useState<LegendItem[]>([])
  const [listings, setListings] = useState<Listing[]>([])
  const [tab, setTab] = useState<Tab>('layers')
  const [open, setOpen] = useState(() => window.innerWidth > 640)
  const [drawing, setDrawing] = useState(false)
  const [drawNonce, setDrawNonce] = useState(0)
  const [parcel, setParcel] = useState<ParcelInfo | null>(null)
  const [mix, setMix] = useState<LandUseShare[] | 'loading' | null>(null)

  useEffect(() => {
    fetch(LEGEND_URL)
      .then((r) => r.json())
      .then(setLegend)
      .catch(() => setLegend([]))
  }, [])

  useEffect(() => {
    fetch(LISTINGS_URL)
      .then((r) => r.json())
      .then((data: ListingsFile) => setListings(data.listings ?? []))
      .catch(() => setListings([]))
  }, [])

  useEffect(() => {
    if (!parcel || legend.length === 0) {
      setMix(null)
      return
    }
    let cancelled = false
    setMix('loading')
    const points = gridInsidePolygon(parcel.geometry)
    sampleLandUseMix(getArchive(PLANNING_URL), legend, points)
      .then((rows) => {
        if (!cancelled) setMix(rows)
      })
      .catch(() => {
        if (!cancelled) setMix(null)
      })
    return () => {
      cancelled = true
    }
  }, [parcel, legend])

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

  return (
    <div className="app">
      <MapView
        base={base}
        showPlanning={showPlanning}
        showBoundary={showBoundary}
        showListings={showListings}
        opacity={opacity}
        legend={legend}
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
            <h1>Soi quy hoạch Cầu Giấy</h1>
            <p>Quy hoạch 2030 · vẽ thửa · giá demo</p>
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
                    opacity={opacity}
                    onOpacityChange={setOpacity}
                  />
                  <p className="hint">Bấm bản đồ để xem loại đất. Dùng công cụ đa giác góc trên phải để vẽ ranh thửa.</p>
                </>
              )}
              {tab === 'legend' && <Legend items={legend} />}
              {tab === 'parcel' && (
                <ParcelPanel parcel={parcel} mix={mix} listings={showListings ? listings : []} onStartDraw={startDraw} />
              )}
              {tab === 'price' && <PriceLegend listings={listings} min={priceMin} max={priceMax} />}
            </div>

            <footer className="panel-footer">
              Nguồn QH: Sở TN-MT Hà Nội. Giá là tin ảo để demo, không có giá trị pháp lý hay giao dịch.
            </footer>
          </>
        )}
      </aside>
    </div>
  )
}
