import { useEffect, useMemo, useState } from 'react'
import type { Polygon } from 'geojson'
import Panel from './Panel'
import SabanMap from './SabanMap'
import {
  META_URL,
  LOTS_URL,
  SWATCHES,
  bestMatch,
  downloadLots,
  geometryCenterX,
  loadStatuses,
  lotStatus,
  saveStatuses,
  searchLots,
  swatchOf,
  type ColorMode,
  type LotFeature,
  type PlanMeta,
  type SaleStatus,
  type ZoneId,
} from './model'

const LIST_LIMIT = 80

export default function SabanApp() {
  const [meta, setMeta] = useState<PlanMeta | null>(null)
  const [lots, setLots] = useState<LotFeature[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [statuses, setStatuses] = useState(loadStatuses)
  const [query, setQuery] = useState('')
  const [searchNote, setSearchNote] = useState<string | null>(null)
  const [colorMode, setColorMode] = useState<ColorMode>('product')
  const [hiddenSwatches, setHiddenSwatches] = useState<string[]>([])
  const [hiddenStatuses, setHiddenStatuses] = useState<SaleStatus[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [focusNonce, setFocusNonce] = useState(0)
  const [viewNonce, setViewNonce] = useState(0)
  const [viewZone, setViewZone] = useState<'all' | ZoneId>('all')
  const [open, setOpen] = useState(() => window.innerWidth > 640)
  const [editing, setEditing] = useState(false)
  const [drawing, setDrawing] = useState(false)
  const [shaping, setShaping] = useState(false)

  useEffect(() => {
    let cancelled = false
    Promise.all([fetch(META_URL).then((response) => response.json()), fetch(LOTS_URL).then((response) => response.json())])
      .then(([plan, collection]: [PlanMeta, { features?: LotFeature[] }]) => {
        if (cancelled) return
        const features = collection.features ?? []
        setMeta(plan)
        setLots(features)
        const requested = new URLSearchParams(window.location.search).get('lot')
        if (requested) {
          const found = features.find((lot) => lot.properties.id.toLowerCase() === requested.toLowerCase())
          if (found) {
            setSelectedId(found.properties.id)
            setFocusNonce(1)
          } else {
            setSearchNote(`Không có lô ${requested}`)
          }
        }
        setReady(true)
      })
      .catch(() => {
        if (!cancelled) setLoadError('Không tải được mặt bằng sa bàn.')
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!ready) return
    saveStatuses(statuses)
  }, [statuses, ready])

  useEffect(() => {
    if (!ready) return
    const url = new URL(window.location.href)
    if (selectedId) url.searchParams.set('lot', selectedId)
    else url.searchParams.delete('lot')
    window.history.replaceState(null, '', `${url.pathname}${url.search}`)
  }, [selectedId, ready])

  const counts = useMemo(() => {
    const tally: Record<string, number> = {}
    for (const swatch of SWATCHES) tally[swatch.id] = 0
    for (const lot of lots) tally[lot.properties.swatch] = (tally[lot.properties.swatch] ?? 0) + 1
    return tally
  }, [lots])

  const statusCounts = useMemo(() => {
    const tally = { available: 0, holding: 0, deposited: 0, sold: 0 }
    for (const lot of lots) tally[lotStatus(statuses, lot.properties.id)] += 1
    return tally
  }, [lots, statuses])

  const visible = useMemo(
    () =>
      lots.filter((lot) => {
        if (hiddenSwatches.includes(lot.properties.swatch)) return false
        return !hiddenStatuses.includes(lotStatus(statuses, lot.properties.id))
      }),
    [lots, hiddenSwatches, hiddenStatuses, statuses],
  )

  const results = useMemo(() => {
    if (query.trim()) return searchLots(lots, query).slice(0, LIST_LIMIT).map((item) => item.lot)
    return visible.slice(0, LIST_LIMIT)
  }, [lots, query, visible])

  const select = (id: string) => {
    setSelectedId(id)
    setFocusNonce((value) => value + 1)
    setSearchNote(null)
    if (window.innerWidth <= 640) setOpen(true)
  }

  const closeLot = (id: string) => {
    setSelectedId((current) => (current === id ? null : current))
  }

  const onSearch = () => {
    if (!query.trim()) return
    const result = bestMatch(lots, query)
    if (!result.lot) {
      setSearchNote(result.ambiguous ? 'Nhiều lô khớp. Chọn một dòng trong danh sách.' : 'Không có lô khớp.')
      return
    }
    select(result.lot.properties.id)
  }

  const rename = (id: string, next: string) => {
    const code = next.trim().toUpperCase().replace(/\s+/g, '-')
    if (!code) return 'Nhập mã lô.'
    if (lots.some((lot) => lot.properties.id === code && lot.properties.id !== id)) return 'Mã này đã có.'
    setLots((current) => current.map((lot) => (lot.properties.id === id ? { ...lot, properties: { ...lot.properties, id: code } } : lot)))
    setStatuses((current) => {
      if (!(id in current)) return current
      const copy = { ...current, [code]: current[id] }
      delete copy[id]
      return copy
    })
    setSelectedId(code)
    return null
  }

  const onCreate = (geometry: Polygon) => {
    if (!meta) return
    const serial = lots.filter((lot) => lot.properties.id.startsWith('NEW-')).length + 1
    const id = `NEW-${String(serial).padStart(2, '0')}`
    const swatch = swatchOf('townhouse-typical')
    const zone = geometryCenterX(geometry) < meta.splitX ? 'park' : 'river'
    const feature: LotFeature = {
      type: 'Feature',
      properties: {
        id,
        zone,
        row: 0,
        index: serial,
        product: swatch.product,
        variant: swatch.variant,
        swatch: swatch.id,
        frontageM: swatch.id === 'townhouse-typical' ? 5 : 0,
        depthM: 18,
        sizeLabel: swatch.sizeLabel,
        areaM2: 90,
        color: swatch.color,
      },
      geometry,
    }
    setLots((current) => [...current, feature])
    setDrawing(false)
    select(id)
  }

  if (!meta) return <div className="boot">{loadError ?? 'Đang tải sa bàn...'}</div>

  const selected = lots.find((lot) => lot.properties.id === selectedId) ?? null
  const resultNote = query.trim()
    ? results.length === 0
      ? 'Không có lô khớp.'
      : null
    : visible.length > LIST_LIMIT
      ? `Hiển thị ${LIST_LIMIT} lô đầu. Gõ mã để thu hẹp.`
      : null

  return (
    <div className="saban">
      <SabanMap
        meta={meta}
        lots={lots}
        statuses={statuses}
        colorMode={colorMode}
        hiddenSwatches={hiddenSwatches}
        hiddenStatuses={hiddenStatuses}
        selectedId={selected?.properties.id ?? null}
        focusNonce={focusNonce}
        viewNonce={viewNonce}
        viewZone={viewZone}
        panelOpen={open}
        editing={editing}
        drawing={drawing}
        shaping={shaping}
        onSelect={select}
        onClose={closeLot}
        onGeometry={(id, geometry) => {
          setLots((current) => current.map((lot) => (lot.properties.id === id ? { ...lot, geometry } : lot)))
        }}
        onCreate={onCreate}
      />
      <Panel
        open={open}
        onToggleOpen={() => setOpen((value) => !value)}
        query={query}
        onQueryChange={(value) => {
          setQuery(value)
          setSearchNote(null)
        }}
        onSearch={onSearch}
        searchNote={searchNote}
        colorMode={colorMode}
        onColorMode={setColorMode}
        hiddenSwatches={hiddenSwatches}
        onToggleSwatch={(id) => setHiddenSwatches((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]))}
        hiddenStatuses={hiddenStatuses}
        onToggleStatus={(status) =>
          setHiddenStatuses((current) => (current.includes(status) ? current.filter((item) => item !== status) : [...current, status]))
        }
        counts={counts}
        statusCounts={statusCounts}
        shown={visible.length}
        total={lots.length}
        results={results}
        resultNote={resultNote}
        selected={selected}
        statuses={statuses}
        onSelect={select}
        onStatus={(id, status) => setStatuses((current) => ({ ...current, [id]: status }))}
        onZone={(zone) => {
          setViewZone(zone)
          setViewNonce((value) => value + 1)
          setSelectedId(null)
        }}
        editing={editing}
        onToggleEditing={() => {
          setEditing((value) => !value)
          setDrawing(false)
          setShaping(false)
        }}
        drawing={drawing}
        onToggleDrawing={() => {
          setDrawing((value) => !value)
          setShaping(false)
        }}
        shaping={shaping}
        onToggleShaping={() => {
          setShaping((value) => !value)
          setDrawing(false)
        }}
        onRename={rename}
        onDelete={(id) => {
          setLots((current) => current.filter((lot) => lot.properties.id !== id))
          setSelectedId(null)
          setShaping(false)
        }}
        onDownload={() => downloadLots(lots, statuses)}
      />
    </div>
  )
}
