import { AcEdOpenMode } from '@mlightcad/cad-simple-viewer'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useMlightCadViewInteraction } from '../hooks/useMlightCadViewInteraction'
import {
  createMlightDocManager,
  defaultMlightOpenOptions,
  MLIGHT_VIEWER_BG_RGB,
  MlightCadStaleInitError,
  reframeMlightDrawingExtents,
} from '../lib/mlightCadRuntime'
import { hrefMap } from '../lib/route'

const DEFAULT_DWG_NAME = '241108 Bd SDD-PhanLo MBH(DieuChinhTĐC-PA2).dwg'

function defaultDwgUrl(): string {
  const base = import.meta.env.BASE_URL.replace(/\/?$/, '/')
  return `${base}data/dwg/${encodeURIComponent(DEFAULT_DWG_NAME)}`
}

export default function CadViewerPage() {
  const hostRef = useRef<HTMLDivElement>(null)
  const mountGenerationRef = useRef(0)
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [initError, setInitError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [spotZoomActive, setSpotZoomActive] = useState(false)

  const { clearSpotZoom } = useMlightCadViewInteraction({
    hostRef,
    enabled: ready,
    onSpotZoomActiveChange: setSpotZoomActive,
  })

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const mountGen = ++mountGenerationRef.current
    let cancelled = false

    void (async () => {
      try {
        setInitError(null)
        await createMlightDocManager(host)
        if (cancelled || mountGen !== mountGenerationRef.current) return
        setReady(true)
      } catch (err: unknown) {
        if (cancelled || err instanceof MlightCadStaleInitError) return
        const message = err instanceof Error ? err.message : String(err)
        setInitError(message)
      }
    })()

    return () => {
      cancelled = true
      const genAtCleanup = mountGen
      // Defer past StrictMode re-mount (effect2 bumps mountGenerationRef before microtask runs).
      queueMicrotask(() => {
        void import('@mlightcad/cad-simple-viewer').then(async ({ AcApDocManager }) => {
          if (genAtCleanup !== mountGenerationRef.current) return

          const hostEl = hostRef.current
          const manager = AcApDocManager.tryGetInstance()
          if (!manager) {
            setReady(false)
            return
          }

          const canvas = manager.curView?.canvas
          const viewerLiveOnPage = Boolean(
            hostEl?.isConnected && canvas && hostEl.contains(canvas),
          )
          if (viewerLiveOnPage) return

          await manager.destroy()
          setReady(false)
        })
      })
    }
  }, [])

  const openName = file?.name ?? DEFAULT_DWG_NAME

  useEffect(() => {
    if (!ready) {
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setLoadError(null)

    void (async () => {
      const { AcApDocManager } = await import('@mlightcad/cad-simple-viewer')
      const manager = AcApDocManager.tryGetInstance()
      if (!manager) {
        setLoadError('Viewer chưa sẵn sàng.')
        setLoading(false)
        return
      }

      try {
        let name: string
        let buffer: ArrayBuffer
        if (file) {
          name = file.name
          buffer = await file.arrayBuffer()
        } else {
          name = DEFAULT_DWG_NAME
          const response = await fetch(defaultDwgUrl())
          if (!response.ok) {
            throw new Error('Không tải được bản vẽ mặc định.')
          }
          buffer = await response.arrayBuffer()
        }

        const success = await manager.openDocument(name, buffer, {
          ...defaultMlightOpenOptions,
          mode: AcEdOpenMode.Read,
        })
        if (cancelled) return
        if (!success) {
          setLoadError('Không mở được file bản vẽ.')
          return
        }
        const view = manager.curView
        if (view) view.backgroundColor = MLIGHT_VIEWER_BG_RGB
        await reframeMlightDrawingExtents()
      } catch (err: unknown) {
        if (cancelled) return
        const message = err instanceof Error ? err.message : String(err)
        setLoadError(message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [file, ready])

  const runZoomExtents = useCallback(async () => {
    clearSpotZoom()
    const { AcApDocManager } = await import('@mlightcad/cad-simple-viewer')
    const manager = AcApDocManager.tryGetInstance()
    if (!manager) return
    await manager.executeCommandString('zoom e')
  }, [clearSpotZoom])

  return (
    <div className="cad-viewer-page">
      <header className="cad-viewer-toolbar dwg-toolbar">
        <div className="dwg-toolbar-row">
          <a className="cad-viewer-back dwg-back" href={hrefMap()}>
            ← Bản đồ quy hoạch
          </a>
          <label className="dwg-file">
            <span>Chọn file .dxf hoặc .dwg</span>
            <input
              type="file"
              accept=".dxf,.dwg,application/acad,application/x-acad,image/vnd.dwg"
              onClick={(event) => {
                event.currentTarget.value = ''
              }}
              onChange={(event) => {
                const picked = event.target.files?.[0] ?? null
                setFile(picked)
                setLoadError(null)
              }}
            />
          </label>
          {ready && <span className="dwg-filename">{openName}</span>}
        </div>

        <div className="dwg-toolbar-row dwg-toolbar-row--tools">
          <div className="dwg-tools" role="toolbar" aria-label="Công cụ xem bản vẽ">
            <button type="button" className="dwg-tool-btn" disabled={!ready} onClick={() => void runZoomExtents()}>
              Vừa khung
            </button>
          </div>
        </div>

        {ready && (
          <p className="dwg-tool-hint">
            Di chuột: tô sáng ô dưới con trỏ · Click: chọn ô đó · Kéo: di chuyển · Double-click: phóng vùng · Cuộn: zoom
            {spotZoomActive ? ' · Double-click lần nữa để trở về mức zoom trước' : ''}
          </p>
        )}
      </header>

      <div className="cad-viewer-main dwg-main">
        <div className="cad-viewer-host dwg-viewer-host dwg-viewer-host--nav">
          <div ref={hostRef} className="cad-viewer-canvas-host" />
          {!ready && !initError && <p className="dwg-status">Đang khởi tạo CAD engine…</p>}
          {loading && <p className="dwg-status">Đang mở {openName}…</p>}
          {initError && (
            <p className="dwg-status dwg-status--error" role="alert">
              {initError}
            </p>
          )}
          {loadError && (
            <p className="dwg-status dwg-status--error" role="alert">
              {loadError}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}