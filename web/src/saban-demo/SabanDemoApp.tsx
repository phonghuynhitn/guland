import { useEffect, useMemo, useRef, useState } from 'react'
import AlignPanel from './AlignPanel'
import Panel from './Panel'
import SabanDemoMap from './SabanDemoMap'
import {
  IDENTITY_TWEAK,
  LOTS_URL,
  META_URL,
  STATUS_ORDER,
  anchorsOf,
  demoStatus,
  identityTweak,
  placeLots,
  searchLots,
  type BaseLayer,
  type Lot,
  type PlanMeta,
  type SaleStatus,
  type ZoneTweak,
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

type Placement = {
  global: Align
  zones: Record<string, ZoneTweak>
  outlines: Record<string, [number, number][]>
}

const TARGET_ALL = 'all'

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

function cleanTweak(value: Partial<ZoneTweak> | undefined): ZoneTweak | null {
  if (!value) return null
  const tweak: ZoneTweak = {
    east: value.east ?? 0,
    north: value.north ?? 0,
    scale: value.scale ?? 1,
    rotation: value.rotation ?? 0,
    scaleAcross: value.scaleAcross ?? 1,
    scaleAlong: value.scaleAlong ?? 1,
  }
  const numbers = [tweak.east, tweak.north, tweak.scale, tweak.rotation, tweak.scaleAcross, tweak.scaleAlong]
  if (!numbers.every((item) => Number.isFinite(item))) return null
  if (Math.abs(tweak.east) > 2000 || Math.abs(tweak.north) > 2000) return null
  if (tweak.scale < 0.5 || tweak.scale > 2 || Math.abs(tweak.rotation) > 30) return null
  if (tweak.scaleAcross < 0.5 || tweak.scaleAcross > 2 || tweak.scaleAlong < 0.5 || tweak.scaleAlong > 2) return null
  return identityTweak(tweak) ? null : tweak
}

function cleanZones(raw: unknown, names: string[]): Record<string, ZoneTweak> {
  if (!raw || typeof raw !== 'object') return {}
  const zones: Record<string, ZoneTweak> = {}
  for (const name of names) {
    const tweak = cleanTweak((raw as Record<string, Partial<ZoneTweak>>)[name])
    if (tweak) zones[name] = tweak
  }
  return zones
}

function cleanOutlines(raw: unknown, names: string[]): Record<string, [number, number][]> {
  if (!raw || typeof raw !== 'object') return {}
  const allowed = new Set(names)
  const outlines: Record<string, [number, number][]> = {}
  for (const [name, ring] of Object.entries(raw as Record<string, unknown>)) {
    if (!allowed.has(name) || !Array.isArray(ring) || ring.length < 3 || ring.length > 400) continue
    const points: [number, number][] = []
    let ok = true
    for (const point of ring) {
      if (!Array.isArray(point) || point.length < 2) {
        ok = false
        break
      }
      const x = Number(point[0])
      const y = Number(point[1])
      if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > 20000 || Math.abs(y) > 20000) {
        ok = false
        break
      }
      points.push([x, y])
    }
    if (ok) outlines[name] = points
  }
  return outlines
}

function parseGlobal(parsed: Partial<Align>, meta: PlanMeta): Align | null {
  const numbers = [parsed.lat, parsed.lng, parsed.metersPerPixel, parsed.rotation]
  if (!numbers.every((value) => Number.isFinite(value))) return null
  if (parsed.metersPerPixel! < 0.3 || parsed.metersPerPixel! > 20) return null
  if (Math.abs(parsed.rotation!) > 20) return null
  if (Math.abs(parsed.lat! - meta.center.lat) > 0.05 || Math.abs(parsed.lng! - meta.center.lng) > 0.05) return null
  const across = Number.isFinite(parsed.scaleAcross) ? parsed.scaleAcross! : 1
  const along = Number.isFinite(parsed.scaleAlong) ? parsed.scaleAlong! : 1
  if (across < 0.5 || across > 2 || along < 0.5 || along > 2) return null
  return {
    lat: parsed.lat!,
    lng: parsed.lng!,
    metersPerPixel: parsed.metersPerPixel!,
    rotation: parsed.rotation!,
    scaleAcross: across,
    scaleAlong: along,
  }
}

function loadAlign(meta: PlanMeta): Placement {
  const fallback = originAlign(meta)
  const fileZones = cleanZones(meta.zoneTweaks, meta.zones)
  const fileOutlines = cleanOutlines(meta.zoneOutlines, meta.zones)
  try {
    const raw = localStorage.getItem(ALIGN_KEY)
    if (!raw) return { global: fallback, zones: fileZones, outlines: fileOutlines }
    const parsed = JSON.parse(raw) as Partial<Align> & { global?: Partial<Align>; zones?: unknown; outlines?: unknown }
    const global = parseGlobal(parsed.global ?? parsed, meta)
    if (!global) return { global: fallback, zones: fileZones, outlines: fileOutlines }
    return {
      global,
      zones: parsed.zones ? cleanZones(parsed.zones, meta.zones) : fileZones,
      outlines: parsed.outlines ? cleanOutlines(parsed.outlines, meta.zones) : fileOutlines,
    }
  } catch {
    return { global: fallback, zones: fileZones, outlines: fileOutlines }
  }
}

function saveAlign(placement: Placement) {
  localStorage.setItem(ALIGN_KEY, JSON.stringify(placement))
}

function withAlign(meta: PlanMeta, placement: Placement, liveZone: { name: string; tweak: ZoneTweak } | null): PlanMeta {
  const zoneTweaks = { ...placement.zones }
  if (liveZone) zoneTweaks[liveZone.name] = liveZone.tweak
  return {
    ...meta,
    center: { lat: placement.global.lat, lng: placement.global.lng },
    metersPerPixel: placement.global.metersPerPixel,
    rotation: placement.global.rotation,
    scaleAcross: placement.global.scaleAcross,
    scaleAlong: placement.global.scaleAlong,
    zoneTweaks,
    zoneOutlines: placement.outlines,
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
  const [align, setAlign] = useState<Placement | null>(null)
  const [live, setLive] = useState<Align | null>(null)
  const [liveZone, setLiveZone] = useState<{ name: string; tweak: ZoneTweak } | null>(null)
  const [target, setTarget] = useState(TARGET_ALL)
  const [zoneFocus, setZoneFocus] = useState(0)
  const [aligning, setAligning] = useState(false)
  const [dragLayer, setDragLayer] = useState(true)
  const [opacity, setOpacity] = useState(0.55)
  const [step, setStep] = useState(5)
  const [drawing, setDrawing] = useState(false)
  const [draft, setDraft] = useState<[number, number][]>([])
  const [copied, setCopied] = useState(false)
  const [saved, setSaved] = useState(false)
  const liveRef = useRef<Align | null>(null)
  const liveZoneRef = useRef<{ name: string; tweak: ZoneTweak } | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([fetch(META_URL).then((response) => response.json()), fetch(LOTS_URL).then((response) => response.json())])
      .then(([plan, rows]: [PlanMeta, Lot[]]) => {
        if (cancelled) return
        const placed = ALIGN_ENABLED ? loadAlign(plan) : { global: originAlign(plan), zones: {}, outlines: {} }
        setAlign(placed)
        setMeta({ ...plan, anchors: anchorsOf(rows) })
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

  const memberLots = useMemo(() => placeLots(lots, align?.outlines), [lots, align?.outlines])
  const anchors = useMemo(() => anchorsOf(memberLots, align?.outlines), [memberLots, align?.outlines])
  const scoped = useMemo(() => (zone === 'all' ? memberLots : memberLots.filter((lot) => lot.zone === zone)), [memberLots, zone])
  const shownResults = useMemo(() => {
    if (results.length === 0) return results
    const byId = new Map(memberLots.map((lot) => [lot.id, lot]))
    return results.map((lot) => byId.get(lot.id) ?? lot)
  }, [results, memberLots])

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

  const commit = (next: Placement) => {
    const zones: Record<string, ZoneTweak> = {}
    for (const [name, tweak] of Object.entries(next.zones)) {
      const clamped: ZoneTweak = {
        east: Math.min(2000, Math.max(-2000, tweak.east)),
        north: Math.min(2000, Math.max(-2000, tweak.north)),
        scale: Math.min(2, Math.max(0.5, tweak.scale)),
        rotation: Math.min(30, Math.max(-30, tweak.rotation)),
        scaleAcross: Math.min(2, Math.max(0.5, tweak.scaleAcross)),
        scaleAlong: Math.min(2, Math.max(0.5, tweak.scaleAlong)),
      }
      if (!identityTweak(clamped)) zones[name] = clamped
    }
    const stored = { ...next, zones }
    setAlign(stored)
    setLive(null)
    setLiveZone(null)
    liveRef.current = null
    liveZoneRef.current = null
    saveAlign(stored)
  }

  const zoneTweak = (name: string, source: Placement) => source.zones[name] ?? IDENTITY_TWEAK
  const previewGlobal = live ?? align?.global ?? null
  const previewZone = target === TARGET_ALL ? null : liveZone?.name === target ? liveZone.tweak : align ? zoneTweak(target, align) : null
  const placed = useMemo(
    () => (meta && align ? withAlign({ ...meta, anchors }, align, liveZone) : null),
    [meta, align, liveZone, anchors],
  )
  const preview = useMemo(
    () => (meta && align && previewGlobal ? withAlign({ ...meta, anchors }, { ...align, global: previewGlobal }, liveZone) : null),
    [meta, align, previewGlobal, liveZone, anchors],
  )

  if (!meta || !align || !previewGlobal || !placed || !preview) return <div className="boot">{error ?? 'Đang tải sa bàn...'}</div>

  const shownTweak = previewZone ?? IDENTITY_TWEAK
  const north = target === TARGET_ALL ? (previewGlobal.lat - meta.center.lat) * EARTH : shownTweak.north
  const east =
    target === TARGET_ALL
      ? (previewGlobal.lng - meta.center.lng) * EARTH * Math.cos((meta.center.lat * Math.PI) / 180)
      : shownTweak.east
  const scale = target === TARGET_ALL ? previewGlobal.metersPerPixel / meta.metersPerPixel : shownTweak.scale

  return (
    <div className="demo">
      <header className="topbar">
        <span className="mark">TÂN ĐÔ</span>
        <span className="split" />
        <h1>{meta.title}</h1>
        {ALIGN_ENABLED && (
          <button
            type="button"
            className={`align-toggle${aligning ? ' on' : ''}`}
            onClick={() => {
              setAligning((value) => !value)
              setDrawing(false)
              setDraft([])
            }}
          >
            Căn chỉnh
          </button>
        )}
      </header>
      <div className="stage">
        <SabanDemoMap
          meta={placed}
          preview={preview}
          lots={memberLots}
          base={base}
          zone={zone}
          active={active}
          selectedId={selectedId}
          focusNonce={focusNonce}
          onSelect={choose}
          onToggleBase={() => setBase((value) => (value === 'satellite' ? 'streets' : 'satellite'))}
          opacity={opacity}
          unlocked={aligning}
          dragLayer={aligning && dragLayer}
          hideLots={target === TARGET_ALL && live !== null}
          alignZone={aligning && target !== TARGET_ALL ? target : null}
          focusZone={aligning && target !== TARGET_ALL ? target : null}
          focusZoneNonce={zoneFocus}
          onDrag={(eastMeters, northMeters) => {
            if (target === TARGET_ALL) {
              const current = liveRef.current ?? align.global
              const next = shift(current, eastMeters, northMeters)
              liveRef.current = next
              setLive(next)
              return
            }
            const base = liveZoneRef.current?.name === target ? liveZoneRef.current.tweak : zoneTweak(target, align)
            const next = { name: target, tweak: { ...base, east: base.east + eastMeters, north: base.north + northMeters } }
            liveZoneRef.current = next
            setLiveZone(next)
          }}
          onDragEnd={() => {
            if (liveRef.current) commit({ ...align, global: liveRef.current })
            else if (liveZoneRef.current) {
              const { name, tweak } = liveZoneRef.current
              const zones = { ...align.zones }
              if (identityTweak(tweak)) delete zones[name]
              else zones[name] = tweak
              commit({ ...align, zones })
            }
          }}
          sketching={drawing && target !== TARGET_ALL}
          sketchZone={target !== TARGET_ALL ? target : null}
          draft={draft}
          onSketch={(point) => setDraft((current) => (current.length >= 400 ? current : [...current, point]))}
        />
        {ALIGN_ENABLED && aligning && (
          <AlignPanel
            zones={meta.zones}
            target={target}
            onTarget={(value) => {
              setLive(null)
              setLiveZone(null)
              liveRef.current = null
              liveZoneRef.current = null
              setDrawing(false)
              setDraft([])
              setTarget(value)
              if (value !== TARGET_ALL) setZoneFocus((nonce) => nonce + 1)
            }}
            drawing={drawing && target !== TARGET_ALL}
            draftCount={draft.length}
            hasOutline={target !== TARGET_ALL && Boolean(align.outlines[target])}
            onDraw={() => {
              setDraft([])
              setDrawing(true)
            }}
            onFinish={() => {
              if (target === TARGET_ALL || draft.length < 3) return
              commit({ ...align, outlines: { ...align.outlines, [target]: draft } })
              setDraft([])
              setDrawing(false)
            }}
            onUndo={() => setDraft((current) => current.slice(0, -1))}
            onCancelDraw={() => {
              setDraft([])
              setDrawing(false)
            }}
            onClearOutline={() => {
              if (target === TARGET_ALL) return
              const outlines = { ...align.outlines }
              delete outlines[target]
              commit({ ...align, outlines })
              setDraft([])
              setDrawing(false)
            }}
            dragLayer={dragLayer}
            onDragLayer={setDragLayer}
            opacity={opacity}
            onOpacity={setOpacity}
            step={step}
            onStep={setStep}
            onNudge={(eastMeters, northMeters) => {
              if (target === TARGET_ALL) commit({ ...align, global: shift(align.global, eastMeters, northMeters) })
              else {
                const tweak = zoneTweak(target, align)
                commit({ ...align, zones: { ...align.zones, [target]: { ...tweak, east: tweak.east + eastMeters, north: tweak.north + northMeters } } })
              }
            }}
            onScale={(factor) => {
              if (target === TARGET_ALL) commit({ ...align, global: { ...align.global, metersPerPixel: align.global.metersPerPixel * factor } })
              else {
                const tweak = zoneTweak(target, align)
                commit({ ...align, zones: { ...align.zones, [target]: { ...tweak, scale: tweak.scale * factor } } })
              }
            }}
            onStretchAcross={(factor) => {
              if (target === TARGET_ALL) commit({ ...align, global: { ...align.global, scaleAcross: align.global.scaleAcross * factor } })
              else {
                const tweak = zoneTweak(target, align)
                commit({ ...align, zones: { ...align.zones, [target]: { ...tweak, scaleAcross: tweak.scaleAcross * factor } } })
              }
            }}
            onStretchAlong={(factor) => {
              if (target === TARGET_ALL) commit({ ...align, global: { ...align.global, scaleAlong: align.global.scaleAlong * factor } })
              else {
                const tweak = zoneTweak(target, align)
                commit({ ...align, zones: { ...align.zones, [target]: { ...tweak, scaleAlong: tweak.scaleAlong * factor } } })
              }
            }}
            onRotate={(degrees) => {
              if (target === TARGET_ALL) commit({ ...align, global: { ...align.global, rotation: align.global.rotation + degrees } })
              else {
                const tweak = zoneTweak(target, align)
                commit({ ...align, zones: { ...align.zones, [target]: { ...tweak, rotation: tweak.rotation + degrees } } })
              }
            }}
            scaleAcross={target === TARGET_ALL ? previewGlobal.scaleAcross : shownTweak.scaleAcross}
            scaleAlong={target === TARGET_ALL ? previewGlobal.scaleAlong : shownTweak.scaleAlong}
            east={east}
            north={north}
            scale={scale}
            rotation={target === TARGET_ALL ? previewGlobal.rotation : shownTweak.rotation}
            onSave={() => {
              const payload = {
                center: { lat: align.global.lat, lng: align.global.lng },
                metersPerPixel: align.global.metersPerPixel,
                rotation: align.global.rotation,
                scaleAcross: align.global.scaleAcross,
                scaleAlong: align.global.scaleAlong,
                zoneTweaks: align.zones,
                zoneOutlines: align.outlines,
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
                          zoneTweaks: payload.zoneTweaks,
                          zoneOutlines: payload.zoneOutlines,
                        }
                      : current,
                  )
                  setSaved(true)
                  window.setTimeout(() => setSaved(false), 1600)
                })
                .catch(() => {
                  setSaved(false)
                })
            }}
            saved={saved}
            onReset={() => {
              if (target === TARGET_ALL) commit({ ...align, global: originAlign(meta) })
              else {
                const zones = { ...align.zones }
                delete zones[target]
                commit({ ...align, zones })
              }
            }}
            onCopy={() => {
              const payload = {
                center: { lat: align.global.lat, lng: align.global.lng },
                metersPerPixel: align.global.metersPerPixel,
                rotation: align.global.rotation,
                scaleAcross: align.global.scaleAcross,
                scaleAlong: align.global.scaleAlong,
                zoneTweaks: align.zones,
                zoneOutlines: align.outlines,
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
          results={shownResults}
          selectedId={selectedId}
          onSelect={choose}
        />
      </div>
    </div>
  )
}
