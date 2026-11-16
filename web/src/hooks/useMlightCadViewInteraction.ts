import {
  AcApDocManager,
  AcEdViewMode,
  type AcTrView2d,
} from '@mlightcad/cad-simple-viewer'
import { type RefObject, useCallback, useEffect, useRef } from 'react'
import { canvasLocalPoint } from '../lib/dwgMeasure'
import {
  bindMlightViewFrameGuard,
  captureMlightView,
  disableMlightBuiltInNavigation,
  panMlightViewByScreenDelta,
  restoreMlightView,
  SPOT_ZOOM_FACTOR,
  zoomMlightViewAtScreen,
  type MlightSavedView,
} from '../lib/mlightCadCamera'

const DRAG_THRESHOLD_PX = 5
const WHEEL_ZOOM_BASE = 1.0012

type Args = {
  hostRef: RefObject<HTMLDivElement | null>
  enabled: boolean
  onSpotZoomActiveChange?: (active: boolean) => void
}

function getView(): AcTrView2d | null {
  const manager = AcApDocManager.tryGetInstance()
  if (!manager) return null
  return manager.curView
}

function canUseCustomNav(): boolean {
  const manager = AcApDocManager.tryGetInstance()
  if (!manager) return false
  return !manager.editor.isActive
}

export function useMlightCadViewInteraction({
  hostRef,
  enabled,
  onSpotZoomActiveChange,
}: Args) {
  const spotZoomActiveRef = useRef(false)
  const savedViewRef = useRef<MlightSavedView | null>(null)

  const clearSpotZoom = useCallback(() => {
    if (!spotZoomActiveRef.current) return
    spotZoomActiveRef.current = false
    savedViewRef.current = null
    onSpotZoomActiveChange?.(false)
  }, [onSpotZoomActiveChange])

  useEffect(() => {
    if (!enabled) return

    const host = hostRef.current
    if (!host) return

    const resolveCanvas = (): HTMLCanvasElement | null => {
      const view = getView()
      if (view?.canvas) return view.canvas
      return host.querySelector('canvas')
    }

    let canvas: HTMLCanvasElement | null = resolveCanvas()
    let pointerId: number | null = null
    let startX = 0
    let startY = 0
    let lastX = 0
    let lastY = 0
    let dragging = false
    let clickTimer: ReturnType<typeof setTimeout> | null = null
    let unbindFrameGuard: (() => void) | null = null
    let guardTimer: ReturnType<typeof setInterval> | null = null
    let disposed = false

    const blockOrbitMouseButton = (event: PointerEvent) => {
      if (event.button === 0) return
      event.preventDefault()
      event.stopImmediatePropagation()
    }

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return
      const view = getView()
      if (!view || !canUseCustomNav()) return

      pointerId = event.pointerId
      const local = canvasLocalPoint(canvas!, event.clientX, event.clientY)
      startX = local.x
      startY = local.y
      lastX = local.x
      lastY = local.y
      dragging = false
      canvas!.setPointerCapture(event.pointerId)
      event.preventDefault()
      event.stopImmediatePropagation()
    }

    const onPointerMove = (event: PointerEvent) => {
      if (pointerId === null || event.pointerId !== pointerId) return
      const view = getView()
      if (!view) return

      const local = canvasLocalPoint(canvas!, event.clientX, event.clientY)
      const fromStart = Math.hypot(local.x - startX, local.y - startY)

      if (!dragging && fromStart >= DRAG_THRESHOLD_PX) {
        dragging = true
        clearSpotZoom()
      }

      if (dragging) {
        const dx = local.x - lastX
        const dy = local.y - lastY
        lastX = local.x
        lastY = local.y
        panMlightViewByScreenDelta(view, dx, dy, { x: lastX - dx, y: lastY - dy })
      }

      event.preventDefault()
      event.stopImmediatePropagation()
    }

    const onPointerUp = (event: PointerEvent) => {
      if (pointerId === null || event.pointerId !== pointerId) return
      const view = getView()

      try {
        canvas!.releasePointerCapture(event.pointerId)
      } catch {
        /* already released */
      }

      if (view && !dragging && canUseCustomNav()) {
        const local = canvasLocalPoint(canvas!, event.clientX, event.clientY)
        if (clickTimer) clearTimeout(clickTimer)
        clickTimer = setTimeout(() => {
          clickTimer = null
          const v = getView()
          if (!v || !canUseCustomNav()) return
          const world = v.screenToWorld(local)
          const hits = v.pick(world, undefined, true)
          if (hits.length > 0) {
            v.applySelection([hits[0].id], 'replace')
          } else {
            v.selectionSet.clear()
          }
        }, 240)
      }

      pointerId = null
      dragging = false
      event.preventDefault()
      event.stopImmediatePropagation()
    }

    const onDoubleClick = (event: MouseEvent) => {
      if (clickTimer) {
        clearTimeout(clickTimer)
        clickTimer = null
      }
      const view = getView()
      if (!view || !canUseCustomNav()) return
      const local = canvasLocalPoint(canvas!, event.clientX, event.clientY)

      if (!spotZoomActiveRef.current) {
        savedViewRef.current = captureMlightView(view)
        zoomMlightViewAtScreen(view, local, SPOT_ZOOM_FACTOR)
        spotZoomActiveRef.current = true
        onSpotZoomActiveChange?.(true)
      } else if (savedViewRef.current) {
        restoreMlightView(view, savedViewRef.current)
        clearSpotZoom()
      }

      event.preventDefault()
      event.stopImmediatePropagation()
    }

    const onWheel = (event: WheelEvent) => {
      if (!canUseCustomNav()) return
      const view = getView()
      const canvasEl = canvas ?? view?.canvas
      if (!view || !canvasEl) return

      if (event.ctrlKey || event.metaKey) {
        event.preventDefault()
        event.stopImmediatePropagation()
        return
      }

      const rawDelta = event.deltaY
      if (rawDelta === 0) return

      event.preventDefault()
      event.stopImmediatePropagation()

      clearSpotZoom()
      const local = canvasLocalPoint(canvasEl, event.clientX, event.clientY)
      const factor = Math.pow(WHEEL_ZOOM_BASE, -rawDelta)
      zoomMlightViewAtScreen(view, local, factor)
    }

    const attachToCanvas = (target: HTMLCanvasElement) => {
      canvas = target
      const view = getView()
      if (view) {
        try {
          view.mode = AcEdViewMode.SELECTION
          unbindFrameGuard?.()
          unbindFrameGuard = bindMlightViewFrameGuard(view)
        } catch {
          /* view may still be wiring up or disposing (StrictMode) */
        }
      }

      target.addEventListener('pointerdown', blockOrbitMouseButton, true)
      target.addEventListener('pointerdown', onPointerDown, true)
      target.addEventListener('pointermove', onPointerMove, true)
      target.addEventListener('pointerup', onPointerUp, true)
      target.addEventListener('pointercancel', onPointerUp, true)
      target.addEventListener('dblclick', onDoubleClick, true)
    }

    const detachFromCanvas = () => {
      if (!canvas) return
      if (clickTimer) clearTimeout(clickTimer)
      canvas.removeEventListener('pointerdown', blockOrbitMouseButton, true)
      canvas.removeEventListener('pointerdown', onPointerDown, true)
      canvas.removeEventListener('pointermove', onPointerMove, true)
      canvas.removeEventListener('pointerup', onPointerUp, true)
      canvas.removeEventListener('pointercancel', onPointerUp, true)
      canvas.removeEventListener('dblclick', onDoubleClick, true)
    }

    const onHostWheel = (event: WheelEvent) => {
      const target = event.target
      if (!(target instanceof Node) || !host.contains(target)) return
      onWheel(event)
    }
    host.addEventListener('wheel', onHostWheel, { capture: true, passive: false })

    guardTimer = setInterval(() => {
      const view = getView()
      if (!view) return
      disableMlightBuiltInNavigation(view)
    }, 750)

    let observer: MutationObserver | null = null
    if (canvas) {
      attachToCanvas(canvas)
    } else {
      observer = new MutationObserver(() => {
        if (disposed || canvas) return
        const next = resolveCanvas()
        if (!next) return
        observer?.disconnect()
        observer = null
        attachToCanvas(next)
      })
      observer.observe(host, { childList: true, subtree: true })
    }

    return () => {
      disposed = true
      if (guardTimer) clearInterval(guardTimer)
      unbindFrameGuard?.()
      unbindFrameGuard = null
      host.removeEventListener('wheel', onHostWheel, { capture: true })
      observer?.disconnect()
      detachFromCanvas()
    }
  }, [hostRef, enabled, clearSpotZoom, onSpotZoomActiveChange])

  return { clearSpotZoom }
}