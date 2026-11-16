import type { SelectEvent } from '@cadview/core'
import { useCadViewer } from '@cadview/react'
import { getDwgReleaseName, getDwgVersion, initWasm, isDwg } from '@cadview/dwg'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import DwgMeasureOverlay from '../components/DwgMeasureOverlay'
import { useDwgViewInteraction, type DwgViewMode } from '../hooks/useDwgViewInteraction'
import {
  canvasLocalPoint,
  type DwgMeasureState,
  screenToWorldPoint,
  worldDistance,
} from '../lib/dwgMeasure'
import { dwgConverterForViewer, formatFileSize, isLargeCadFile } from '../lib/dwgConverterConfig'
import { describeDwgEntity, focusDwgEntity, searchDwgEntities, type DwgSearchHit } from '../lib/dwgSearch'
import { asCadInternals } from '../lib/dwgViewerInternals'
import { hrefMap } from '../lib/route'

const ZOOM_STEP = 1.2

export default function DwgPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [wasmError, setWasmError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<DwgViewMode>('view')
  const [query, setQuery] = useState('')
  const [selection, setSelection] = useState<SelectEvent | null>(null)
  const [measureNote, setMeasureNote] = useState<string | null>(null)
  const [measureState, setMeasureState] = useState<DwgMeasureState>({ kind: 'idle' })
  const [viewRevision, setViewRevision] = useState(0)
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 })
  const [spotZoomActive, setSpotZoomActive] = useState(false)
  const [loadWarning, setLoadWarning] = useState<string | null>(null)

  const formatConverters = useMemo(() => [dwgConverterForViewer], [])

  const { viewer, loadFile, error, isLoaded } = useCadViewer(canvasRef, {
    theme: 'dark',
    initialTool: 'pan',
    formatConverters,
    worker: true,
  })

  const viewerRef = useRef(viewer)
  viewerRef.current = viewer
  const loadFileRef = useRef(loadFile)
  loadFileRef.current = loadFile

  const { clearSpotZoom } = useDwgViewInteraction({
    canvasRef,
    viewerRef,
    mode,
    enabled: isLoaded,
    onSpotZoomActiveChange: setSpotZoomActive,
  })

  const setViewMode = useCallback((next: DwgViewMode) => {
    setMode(next)
    setMeasureState({ kind: 'idle' })
    setMeasureNote(null)
    viewerRef.current?.setTool('pan')
  }, [])

  useEffect(() => {
    if (measureState.kind === 'done') {
      setMeasureNote(`Khoảng cách: ${measureState.distance.toFixed(4)} (đơn vị bản vẽ)`)
    }
  }, [measureState])

  const zoomAtCenter = useCallback((factor: number) => {
    const canvas = canvasRef.current
    const v = viewerRef.current
    if (!canvas || !v) return
    clearSpotZoom()
    const rect = canvas.getBoundingClientRect()
    asCadInternals(v).handleZoom(rect.width / 2, rect.height / 2, factor)
  }, [clearSpotZoom])

  const onFitToView = useCallback(() => {
    clearSpotZoom()
    viewerRef.current?.fitToView()
  }, [clearSpotZoom])

  useEffect(() => {
    initWasm()
      .then(() => setWasmError(null))
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err)
        setWasmError(message)
      })
  }, [])

  useEffect(() => {
    if (!file) {
      setLoading(false)
      setSelection(null)
      setQuery('')
      return
    }
    let cancelled = false
    setLoading(true)
    setSelection(null)
    setMeasureState({ kind: 'idle' })
    setMeasureNote(null)
    setSpotZoomActive(false)
    setLoadWarning(null)
    setMode('view')
    const currentFile = file
    void loadFileRef.current(file)
      .then(async () => {
        if (cancelled) return
        const v = viewerRef.current
        if (!v) return
        requestAnimationFrame(() => v.fitToView())
        const count = v.getEntities().length
        if (count > 0) {
          setLoadWarning(null)
          return
        }
        let versionHint = ''
        try {
          const buf = await currentFile.arrayBuffer()
          if (isDwg(buf)) {
            const ver = getDwgVersion(buf)
            if (ver) versionHint = ` Phiên bản DWG: ${ver} (${getDwgReleaseName(ver) ?? 'không rõ'}).`
          }
        } catch {
          /* ignore */
        }
        setLoadWarning(
          `File đã mở nhưng không có đối tượng vẽ được (0 entity).${versionHint} Có thể bản vẽ rỗng, có password, chuyển DWG thất bại một phần, hoặc loại đối tượng chưa được viewer hỗ trợ.`,
        )
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [file])

  useEffect(() => {
    if (!viewer) return
    const onSelect = (event: SelectEvent) => {
      setSelection(event)
    }
    const onViewChange = () => setViewRevision((n) => n + 1)
    viewer.on('select', onSelect)
    viewer.on('viewchange', onViewChange)
    return () => {
      viewer.off('select', onSelect)
      viewer.off('viewchange', onViewChange)
    }
  }, [viewer])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const syncSize = () => {
      const rect = canvas.getBoundingClientRect()
      setCanvasSize({ width: rect.width, height: rect.height })
    }
    syncSize()
    const ro = new ResizeObserver(syncSize)
    ro.observe(canvas)
    return () => ro.disconnect()
  }, [isLoaded, viewRevision])

  useEffect(() => {
    if (mode !== 'measure' || !isLoaded) return
    const canvas = canvasRef.current
    if (!canvas) return

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return
      const vt = viewerRef.current?.getViewTransform()
      if (!vt) return
      const cursor = canvasLocalPoint(canvas, event.clientX, event.clientY)
      const world = screenToWorldPoint(vt, cursor)

      setMeasureState((prev) => {
        if (prev.kind === 'idle' || prev.kind === 'done') {
          return { kind: 'preview', p1: world, cursor }
        }
        if (prev.kind === 'preview') {
          const distance = worldDistance(prev.p1, world)
          return { kind: 'done', p1: prev.p1, p2: world, distance }
        }
        return prev
      })

      event.preventDefault()
      event.stopPropagation()
    }

    const onPointerMove = (event: PointerEvent) => {
      const cursor = canvasLocalPoint(canvas, event.clientX, event.clientY)
      setMeasureState((prev) => {
        if (prev.kind === 'preview') return { ...prev, cursor }
        return prev
      })
    }

    canvas.addEventListener('pointerdown', onPointerDown, true)
    canvas.addEventListener('pointermove', onPointerMove)
    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown, true)
      canvas.removeEventListener('pointermove', onPointerMove)
    }
  }, [mode, isLoaded])

  const entities = useMemo(() => {
    if (!isLoaded || !viewer) return []
    return viewer.getEntities()
  }, [isLoaded, viewer, file])

  const searchHits = useMemo(() => searchDwgEntities(entities, query), [entities, query])

  const jumpToHit = useCallback(
    (hit: DwgSearchHit) => {
      if (!viewer || !canvasRef.current) return
      const entity = entities[hit.entityIndex]
      if (!entity) return
      clearSpotZoom()
      focusDwgEntity(viewer, canvasRef.current, entity)
      setSelection({
        entity,
        entityIndex: hit.entityIndex,
        worldPoint: { x: 0, y: 0 },
        screenPoint: { x: 0, y: 0 },
      })
      setViewMode('view')
    },
    [entities, clearSpotZoom, setViewMode, viewer],
  )

  const loadError = wasmError ?? error?.message
  const loadNotice = loadError ?? loadWarning
  const selectionInfo = selection ? describeDwgEntity(selection.entity) : null

  const viewHint =
    mode === 'measure'
      ? 'Bấm hai điểm để đo · Giữ và kéo (hoặc chuột giữa) để di chuyển'
      : 'Giữ kéo: di chuyển · Click: chọn · Double-click: phóng/ thu vùng · Cuộn: zoom'

  return (
    <div className="dwg-page">
      <header className="dwg-toolbar">
        <div className="dwg-toolbar-row">
          <a className="dwg-back" href={hrefMap()}>
            ← Bản đồ quy hoạch
          </a>
          <label className="dwg-file">
            <span>Chọn file .dxf hoặc .dwg</span>
            <input
              type="file"
              accept=".dxf,.dwg"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
          {file && <span className="dwg-filename">{file.name}</span>}
        </div>

        <div className="dwg-toolbar-row dwg-toolbar-row--tools">
          <div className="dwg-tools" role="toolbar" aria-label="Công cụ xem bản vẽ">
            <button
              type="button"
              className={`dwg-tool-btn${mode === 'view' ? ' active' : ''}`}
              disabled={!isLoaded}
              onClick={() => setViewMode('view')}
            >
              Xem
            </button>
            <button
              type="button"
              className={`dwg-tool-btn${mode === 'measure' ? ' active' : ''}`}
              disabled={!isLoaded}
              onClick={() => setViewMode('measure')}
            >
              Đo
            </button>
            <button
              type="button"
              className="dwg-tool-btn"
              disabled={!isLoaded}
              title="Thu nhỏ"
              onClick={() => zoomAtCenter(1 / ZOOM_STEP)}
            >
              −
            </button>
            <button
              type="button"
              className="dwg-tool-btn"
              disabled={!isLoaded}
              title="Phóng to"
              onClick={() => zoomAtCenter(ZOOM_STEP)}
            >
              +
            </button>
            <button type="button" className="dwg-tool-btn" disabled={!isLoaded} onClick={onFitToView}>
              Vừa khung
            </button>
          </div>

          <div className="dwg-search">
            <input
              type="search"
              className="dwg-search-input"
              placeholder="Tìm lớp, chữ (TEXT), loại đối tượng…"
              value={query}
              disabled={!isLoaded}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query.trim() && isLoaded && (
              <ul className="dwg-search-results" role="listbox">
                {searchHits.length === 0 ? (
                  <li className="dwg-search-empty">Không có kết quả.</li>
                ) : (
                  searchHits.map((hit) => (
                    <li key={hit.entityIndex}>
                      <button type="button" className="dwg-search-hit" onClick={() => jumpToHit(hit)}>
                        <span className="dwg-search-hit-title">{hit.title}</span>
                        <span className="dwg-search-hit-sub">{hit.subtitle}</span>
                      </button>
                    </li>
                  ))
                )}
              </ul>
            )}
          </div>
        </div>

        {isLoaded && (
          <p className="dwg-tool-hint">
            {viewHint}
            {spotZoomActive ? ' · Double-click lần nữa để trở về mức zoom trước' : ''}
            {measureNote ? ` · ${measureNote}` : ''}
          </p>
        )}
      </header>

      <div className="dwg-main">
        <div className={`dwg-viewer-host${mode === 'view' ? ' dwg-viewer-host--nav' : ''}`}>
          <canvas ref={canvasRef} className="dwg-canvas" />
          {mode === 'measure' && (
            <DwgMeasureOverlay
              width={canvasSize.width}
              height={canvasSize.height}
              vt={viewer?.getViewTransform() ?? null}
              state={measureState}
            />
          )}
          {!file && <p className="dwg-placeholder">Chọn file bản vẽ để xem.</p>}
          {loading && file && (
            <p className="dwg-status">
              Đang tải {formatFileSize(file.size)}
              {file.name.toLowerCase().endsWith('.dwg') ? ' — chuyển DWG (file lớn có thể mất vài phút)' : ''}
              {isLargeCadFile(file.size) ? ' · Giữ tab mở, đừng đổi file giữa chừng' : ''}
            </p>
          )}
          {loadNotice && (
            <p
              className={`dwg-status${loadError ? ' dwg-status--error' : ' dwg-status--warn'}`}
              role="alert"
            >
              {loadNotice}
            </p>
          )}
        </div>

        {selectionInfo && (
          <aside className="dwg-inspector" aria-label="Đối tượng đã chọn">
            <h2>Đã chọn</h2>
            <p className="dwg-inspector-headline">{selectionInfo.headline}</p>
            <ul>
              {selectionInfo.lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            {selection && (
              <p className="dwg-inspector-meta">Chỉ số entity: {selection.entityIndex}</p>
            )}
          </aside>
        )}
      </div>
    </div>
  )
}