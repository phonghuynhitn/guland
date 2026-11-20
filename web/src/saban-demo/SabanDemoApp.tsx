import { useEffect, useMemo, useRef, useState } from 'react'
import AlignPanel from './AlignPanel'
import Panel from './Panel'
import SabanDemoMap from './SabanDemoMap'
import {
  LOTS_URL,
  META_URL,
  STATUS_ORDER,
  demoStatus,
  searchLots,
  type BaseLayer,
  type Lot,
  type PlanMeta,
  type SaleStatus,
} from './model'

const ALIGN_KEY = 'saban-demo-align'
const ALIGN_ENABLED = true
const EARTH = 111320

type Align = {
  lat: number
  lng: number
  metersPerPixel: number
  rotation: number
  scaleAcross: number
  scaleAlong: number
}

function originAlign(meta: PlanMeta): Align {
  return {
    lat: meta.center.lat,
    lng: meta.center.lng,
    metersPerPixel: meta.metersPerPixel,
    rotation: meta.rotation ?? 0,
    scaleAcross: meta.scaleAcross ?? 1,
    scaleAlong: meta.scaleAlong ?? 1,
  }
}

function loadAlign(meta: PlanMeta): Align {
  const fallback = originAlign(meta)
  try {
    const raw = localStorage.getItem(ALIGN_KEY)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as Partial<Align>
    const numbers = [parsed.lat, parsed.lng, parsed.metersPerPixel, parsed.rotation]
    if (!numbers.every((value) => Number.isFinite(value))) return fallback
    if (parsed.metersPerPixel! < 0.3 || parsed.metersPerPixel! > 20) return fallback
    if (Math.abs(parsed.rotation!) > 20) return fallback
    if (Math.abs(parsed.lat! - meta.center.lat) > 0.05 || Math.abs(parsed.lng! - meta.center.lng) > 0.05) return fallback
    const across = Number.isFinite(parsed.scaleAcross) ? parsed.scaleAcross! : 1
    const along = Number.isFinite(parsed.scaleAlong) ? parsed.scaleAlong! : 1
    if (across < 0.5 || across > 2 || along < 0.5 || along > 2) return fallback
    return {
      lat: parsed.lat!,
      lng: parsed.lng!,
      metersPerPixel: parsed.metersPerPixel!,
      rotation: parsed.rotation!,
      scaleAcross: across,
      scaleAlong: along,
    }
  } catch {
    return fallback
  }
}

function saveAlign(align: Align) {
  localStorage.setItem(ALIGN_KEY, JSON.stringify(align))
}

function withAlign(meta: PlanMeta, align: Align): PlanMeta {
  return {
    ...meta,
    center: { lat: align.lat, lng: align.lng },
    metersPerPixel: align.metersPerPixel,
    rotation: align.rotation,
    scaleAcross: align.scaleAcross,
    scaleAlong: align.scaleAlong,
  }
}

function shift(align: Align, east: number, north: number): Align {
  return {
    ...align,
    lat: align.lat + north / EARTH,
    lng: align.lng + east / (EARTH * Math.cos((align.lat * Math.PI) / 180)),
  }
}

export default function SabanDemoApp() {
  const [meta, setMeta] = useState<PlanMeta | null>(null)
  const [lots, setLots] = useState<Lot[]>([])
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [note, setNote] = useState<string | null>(null)
  const [results, setResults] = useState<Lot[]>([])
  const [zone, setZone] = useState('all')
  const [active, setActive] = useState<SaleStatus[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [focusNonce, setFocusNonce] = useState(0)
  const [base, setBase] = useState<BaseLayer>('satellite')
  const [open, setOpen] = useState(() => window.innerWidth > 720)
  const [align, setAlign] = useState<Align | null>(null)
  const [live, setLive] = useState<Align | null>(null)
  const [aligning, setAligning] = useState(false)
  const [dragLayer, setDragLayer] = useState(true)
  const [opacity, setOpacity] = useState(0.55)
  const [step, setStep] = useState(5)
  const [copied, setCopied] = useState(false)
  const [saved, setSaved] = useState(false)
  const liveRef = useRef<Align | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([fetch(META_URL).then((response) => response.json()), fetch(LOTS_URL).then((response) => response.json())])
      .then(([plan, rows]: [PlanMeta, Lot[]]) => {
        if (cancelled) return
        const placed = ALIGN_ENABLED ? loadAlign(plan) : originAlign(plan)
        liveRef.current = placed
        setAlign(placed)
        setMeta(plan)
        setLots(rows)
        const requested = new URLSearchParams(window.location.search).get('lot')
        if (requested && rows.some((lot) => lot.id === requested)) setSelectedId(requested)
      })
      .catch(() => {
        if (!cancelled) setError('Không tải được mặt bằng sa bàn.')
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!meta) return
    const url = new URL(window.location.href)
    if (selectedId) url.searchParams.set('lot', selectedId)
    else url.searchParams.delete('lot')
    window.history.replaceState(null, '', `${url.pathname}${url.search}`)
  }, [selectedId, meta])

  const scoped = useMemo(() => (zone === 'all' ? lots : lots.filter((lot) => lot.zone === zone)), [lots, zone])

  const counts = useMemo(() => {
    const tally = { available: 0, holding: 0, deposited: 0, contract: 0, liquidated: 0 }
    for (const lot of scoped) tally[demoStatus(lot.code)] += 1
    return tally
  }, [scoped])

  const choose = (id: string) => {
    setSelectedId((current) => (current === id ? null : id))
    setFocusNonce((value) => value + 1)
    if (window.innerWidth <= 720) setOpen(true)
  }

  const onSearch = () => {
    const found = searchLots(scoped, query)
    setResults(found)
    if (!query.trim()) {
      setNote(null)
      return
    }
    if (found.length === 0) {
      setNote('Không có lô này.')
      return
    }
    if (found.length === 1) {
      setNote(null)
      setSelectedId(found[0].id)
      setFocusNonce((value) => value + 1)
      return
    }
    setNote(`${found.length} lô cùng mã. Chọn một dòng.`)
  }

  const commit = (next: Align) => {
    liveRef.current = next
    setAlign(next)
    setLive(null)
    saveAlign(next)
  }

  const previewAlign = live ?? align

  const placed = useMemo(() => (meta && align ? withAlign(meta, align) : null), [meta, align])
  const preview = useMemo(() => (meta && previewAlign ? withAlign(meta, previewAlign) : null), [meta, previewAlign])

  if (!meta || !align || !previewAlign || !placed || !preview) return <div className="boot">{error ?? 'Đang tải sa bàn...'}</div>

  const north = (previewAlign.lat - meta.center.lat) * EARTH
  const east = (previewAlign.lng - meta.center.lng) * EARTH * Math.cos((meta.center.lat * Math.PI) / 180)
  const scale = previewAlign.metersPerPixel / meta.metersPerPixel

  return (
    <div className="demo">
      <header className="topbar">
        <span className="mark">TÂN ĐÔ</span>
        <span className="split" />
        <h1>{meta.title}</h1>
        {ALIGN_ENABLED && (
          <button type="button" className={`align-toggle${aligning ? ' on' : ''}`} onClick={() => setAligning((value) => !value)}>
            Căn chỉnh
          </button>
        )}
      </header>
      <div className="stage">
        <SabanDemoMap
          meta={placed}
          preview={preview}
          lots={lots}
          base={base}
          zone={zone}
          active={active}
          selectedId={selectedId}
          focusNonce={focusNonce}
          onSelect={choose}
          onToggleBase={() => setBase((value) => (value === 'satellite' ? 'streets' : 'satellite'))}
          opacity={aligning ? opacity : 1}
          unlocked={aligning}
          dragLayer={aligning && dragLayer}
          hideLots={live !== null}
          onDrag={(eastMeters, northMeters) => {
            const current = liveRef.current ?? align
            const next = shift(current, eastMeters, northMeters)
            liveRef.current = next
            setLive(next)
          }}
          onDragEnd={() => {
            if (liveRef.current) commit(liveRef.current)
          }}
        />
        {ALIGN_ENABLED && aligning && (
          <AlignPanel
            dragLayer={dragLayer}
            onDragLayer={setDragLayer}
            opacity={opacity}
            onOpacity={setOpacity}
            step={step}
            onStep={setStep}
            onNudge={(eastMeters, northMeters) => commit(shift(align, eastMeters, northMeters))}
            onScale={(factor) => commit({ ...align, metersPerPixel: align.metersPerPixel * factor })}
            onStretchAcross={(factor) => commit({ ...align, scaleAcross: align.scaleAcross * factor })}
            onStretchAlong={(factor) => commit({ ...align, scaleAlong: align.scaleAlong * factor })}
            onRotate={(degrees) => commit({ ...align, rotation: align.rotation + degrees })}
            scaleAcross={previewAlign.scaleAcross}
            scaleAlong={previewAlign.scaleAlong}
            east={east}
            north={north}
            scale={scale}
            rotation={previewAlign.rotation}
            onSave={() => {
              const payload = {
                center: { lat: align.lat, lng: align.lng },
                metersPerPixel: align.metersPerPixel,
                rotation: align.rotation,
                scaleAcross: align.scaleAcross,
                scaleAlong: align.scaleAlong,
              }
              saveAlign(align)
              void fetch(`${import.meta.env.BASE_URL}api/saban-demo-align`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(payload),
              })
                .then((response) => {
                  if (!response.ok) throw new Error('save failed')
                  setMeta((current) =>
                    current
                      ? {
                          ...current,
                          center: payload.center,
                          metersPerPixel: payload.metersPerPixel,
                          rotation: payload.rotation,
                          scaleAcross: payload.scaleAcross,
                          scaleAlong: payload.scaleAlong,
                        }
                      : current,
                  )
                  setSaved(true)
                  window.setTimeout(() => setSaved(false), 1600)
                })
                .catch(() => {
                  setSaved(true)
                  window.setTimeout(() => setSaved(false), 1600)
                })
            }}
            saved={saved}
            onReset={() => {
              localStorage.removeItem(ALIGN_KEY)
              commit(originAlign(meta))
            }}
            onCopy={() => {
              const payload = {
                center: { lat: align.lat, lng: align.lng },
                metersPerPixel: align.metersPerPixel,
                rotation: align.rotation,
                scaleAcross: align.scaleAcross,
                scaleAlong: align.scaleAlong,
              }
              void navigator.clipboard.writeText(JSON.stringify(payload, null, 2)).then(() => {
                setCopied(true)
                window.setTimeout(() => setCopied(false), 1600)
              })
            }}
            copied={copied}
          />
        )}
        <Panel
          open={open}
          onToggle={() => setOpen((value) => !value)}
          query={query}
          onQuery={(value) => {
            setQuery(value)
            setNote(null)
          }}
          onSearch={onSearch}
          note={note}
          zone={zone}
          zones={meta.zones}
          onZone={setZone}
          active={active}
          onToggleStatus={(status) =>
            setActive((current) => (current.includes(status) ? current.filter((item) => item !== status) : STATUS_ORDER.filter((item) => item === status || current.includes(item))))
          }
          counts={counts}
          results={results}
          selectedId={selectedId}
          onSelect={choose}
        />
      </div>
    </div>
  )
}
