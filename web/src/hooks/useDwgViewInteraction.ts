import type { CadViewer } from '@cadview/core'
import type { RefObject } from 'react'
import { useCallback, useEffect, useRef } from 'react'
import { canvasLocalPoint } from '../lib/dwgMeasure'
import { asCadInternals, cloneViewTransform } from '../lib/dwgViewerInternals'

const DRAG_THRESHOLD_PX = 5
const SPOT_ZOOM_FACTOR = 2.75

export type DwgViewMode = 'view' | 'measure'

type Args = {
  canvasRef: RefObject<HTMLCanvasElement | null>
  viewerRef: RefObject<CadViewer | null>
  mode: DwgViewMode
  enabled: boolean
  onSpotZoomActiveChange?: (active: boolean) => void
}

export function useDwgViewInteraction({
  canvasRef,
  viewerRef,
  mode,
  enabled,
  onSpotZoomActiveChange,
}: Args) {
  const spotZoomActiveRef = useRef(false)
  const savedViewRef = useRef<ReturnType<CadViewer['getViewTransform']> | null>(null)

  const clearSpotZoom = useCallback(() => {
    if (!spotZoomActiveRef.current) return
    spotZoomActiveRef.current = false
    savedViewRef.current = null
    onSpotZoomActiveChange?.(false)
  }, [onSpotZoomActiveChange])

  const restoreSpotZoom = (viewer: CadViewer) => {
    const saved = savedViewRef.current
    if (!saved || !spotZoomActiveRef.current) return
    const internal = asCadInternals(viewer)
    internal.camera.setTransform(cloneViewTransform(saved))
    internal.requestRender()
    clearSpotZoom()
  }

  const applySpotZoom = (viewer: CadViewer, sx: number, sy: number) => {
    const internal = asCadInternals(viewer)
    if (!spotZoomActiveRef.current) {
      savedViewRef.current = cloneViewTransform(viewer.getViewTransform())
      internal.handleZoom(sx, sy, SPOT_ZOOM_FACTOR)
      spotZoomActiveRef.current = true
      onSpotZoomActiveChange?.(true)
      return
    }
    restoreSpotZoom(viewer)
  }

  useEffect(() => {
    if (!enabled || mode !== 'view') return
    const canvas = canvasRef.current
    if (!canvas) return

    let pointerId: number | null = null
    let startX = 0
    let startY = 0
    let lastX = 0
    let lastY = 0
    let dragging = false
    let clickTimer: ReturnType<typeof setTimeout> | null = null

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return
      const viewer = viewerRef.current
      if (!viewer) return

      pointerId = event.pointerId
      const local = canvasLocalPoint(canvas, event.clientX, event.clientY)
      startX = local.x
      startY = local.y
      lastX = local.x
      lastY = local.y
      dragging = false
      canvas.setPointerCapture(event.pointerId)
      event.preventDefault()
      event.stopPropagation()
    }

    const onPointerMove = (event: PointerEvent) => {
      if (pointerId === null || event.pointerId !== pointerId) return
      const viewer = viewerRef.current
      if (!viewer) return

      const local = canvasLocalPoint(canvas, event.clientX, event.clientY)
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
        asCadInternals(viewer).handlePan(dx, dy)
      }

      event.preventDefault()
      event.stopPropagation()
    }

    const onPointerUp = (event: PointerEvent) => {
      if (pointerId === null || event.pointerId !== pointerId) return
      const viewer = viewerRef.current

      try {
        canvas.releasePointerCapture(event.pointerId)
      } catch {
        /* already released */
      }

      if (viewer && !dragging) {
        const local = canvasLocalPoint(canvas, event.clientX, event.clientY)
        if (clickTimer) clearTimeout(clickTimer)
        clickTimer = setTimeout(() => {
          clickTimer = null
          const v = viewerRef.current
          if (!v) return
          v.setTool('select')
          asCadInternals(v).handleClick(local.x, local.y)
          v.setTool('pan')
        }, 240)
      }

      pointerId = null
      dragging = false
      event.preventDefault()
      event.stopPropagation()
    }

    const onDoubleClick = (event: MouseEvent) => {
      if (clickTimer) {
        clearTimeout(clickTimer)
        clickTimer = null
      }
      const viewer = viewerRef.current
      if (!viewer) return
      const local = canvasLocalPoint(canvas, event.clientX, event.clientY)
      applySpotZoom(viewer, local.x, local.y)
      event.preventDefault()
      event.stopPropagation()
    }

    canvas.addEventListener('pointerdown', onPointerDown, true)
    canvas.addEventListener('pointermove', onPointerMove, true)
    canvas.addEventListener('pointerup', onPointerUp, true)
    canvas.addEventListener('pointercancel', onPointerUp, true)
    canvas.addEventListener('dblclick', onDoubleClick, true)

    return () => {
      if (clickTimer) clearTimeout(clickTimer)
      canvas.removeEventListener('pointerdown', onPointerDown, true)
      canvas.removeEventListener('pointermove', onPointerMove, true)
      canvas.removeEventListener('pointerup', onPointerUp, true)
      canvas.removeEventListener('pointercancel', onPointerUp, true)
      canvas.removeEventListener('dblclick', onDoubleClick, true)
    }
  }, [canvasRef, viewerRef, mode, enabled, clearSpotZoom, onSpotZoomActiveChange])

  return { clearSpotZoom, restoreSpotZoom }
}