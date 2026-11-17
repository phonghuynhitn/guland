import type { AcTrView2d } from '@mlightcad/cad-simple-viewer'

export type MlightSavedView = {
  x: number
  y: number
  z: number
  zoom: number
}

/** Spot zoom multiplier on double-click (matches `/dwg` `SPOT_ZOOM_FACTOR`). */
export const SPOT_ZOOM_FACTOR = 2.75

const MIN_CAMERA_ZOOM = 1e-6
const MAX_CAMERA_ZOOM = 1e6

type MlightOrbitControls = {
  enabled: boolean
  enableRotate?: boolean
  enablePan?: boolean
  enableZoom?: boolean
  target: { x: number; y: number; z: number }
  update: () => void
}

type MlightOrbitInternals = {
  activeLayoutView?: {
    _cameraControls?: MlightOrbitControls
  }
}

function getMlightOrbitControls(view: AcTrView2d): MlightOrbitControls | null {
  return (view as unknown as MlightOrbitInternals).activeLayoutView?._cameraControls ?? null
}

function viewCamera(view: AcTrView2d) {
  return view.internalCamera as
    | {
        up: { set: (x: number, y: number, z: number) => void }
        rotation: { set: (x: number, y: number, z: number) => void }
        position: { x: number; y: number; z: number; set: (x: number, y: number, z: number) => void }
        zoom: number
        updateProjectionMatrix: () => void
      }
    | undefined
}

/** Orthographic plan view only — no tilt / flipped Z-up frames. */
export function lockMlightViewOrientation(view: AcTrView2d): void {
  const cam = viewCamera(view)
  if (!cam?.up) return
  cam.up.set(0, 1, 0)
  cam.rotation.set(0, 0, 0)
  cam.updateProjectionMatrix()
}

/** Disables built-in Orbit pan/zoom/rotate (we drive the camera ourselves). */
export function disableMlightBuiltInNavigation(view: AcTrView2d): void {
  view.setNavigationEnabled(false)
  const controls = getMlightOrbitControls(view)
  if (!controls) {
    lockMlightViewOrientation(view)
    return
  }
  controls.enabled = false
  controls.enableRotate = false
  controls.enablePan = false
  controls.enableZoom = false
  lockMlightViewOrientation(view)
}

/**
 * Keeps Orbit target on the camera plane without calling `controls.update()`
 * (update + mismatched Z targets is what tilts / flips the frame).
 */
function syncMlightOrbitToCamera(view: AcTrView2d, targetDx = 0, targetDy = 0): void {
  const cam = viewCamera(view)
  if (!cam) return
  const controls = getMlightOrbitControls(view)
  disableMlightBuiltInNavigation(view)
  if (!controls) return
  if (targetDx !== 0 || targetDy !== 0) {
    controls.target.x += targetDx
    controls.target.y += targetDy
  } else {
    controls.target.x = cam.position.x
    controls.target.y = cam.position.y
  }
  controls.target.z = cam.position.z
  lockMlightViewOrientation(view)
}

/** Re-apply frame lock after MLight commands (zoom extents, layout switch, …). */
export function bindMlightViewFrameGuard(view: AcTrView2d): () => void {
  const guard = () => {
    disableMlightBuiltInNavigation(view)
  }
  guard()
  view.events.viewChanged.addEventListener(guard)
  return () => view.events.viewChanged.removeEventListener(guard)
}

export function captureMlightView(view: AcTrView2d): MlightSavedView {
  const cam = viewCamera(view)
  if (!cam) return { x: 0, y: 0, z: 0, zoom: 1 }
  return {
    x: cam.position.x,
    y: cam.position.y,
    z: cam.position.z,
    zoom: cam.zoom,
  }
}

export function restoreMlightView(view: AcTrView2d, saved: MlightSavedView): void {
  const cam = viewCamera(view)
  if (!cam) return
  cam.position.set(saved.x, saved.y, saved.z)
  cam.zoom = saved.zoom
  cam.updateProjectionMatrix()
  syncMlightOrbitToCamera(view)
  notifyMlightViewChanged(view)
}

export function panMlightViewByScreenDelta(
  view: AcTrView2d,
  dx: number,
  dy: number,
  fromCanvas: { x: number; y: number },
): void {
  const w0 = view.screenToWorld(fromCanvas)
  const w1 = view.screenToWorld({ x: fromCanvas.x + dx, y: fromCanvas.y + dy })
  const cam = viewCamera(view)
  if (!cam) return
  const worldDx = w1.x - w0.x
  const worldDy = w1.y - w0.y
  cam.position.x -= worldDx
  cam.position.y -= worldDy
  cam.updateProjectionMatrix()
  syncMlightOrbitToCamera(view, -worldDx, -worldDy)
  notifyMlightViewChanged(view)
}

/** Zoom orthographic camera toward `screen` (canvas coords); `factor` > 1 = zoom in. */
export function zoomMlightViewAtScreen(
  view: AcTrView2d,
  screen: { x: number; y: number },
  factor: number,
): void {
  if (!Number.isFinite(factor) || factor <= 0) return

  const worldAnchor = view.screenToWorld(screen)
  const cam = viewCamera(view)
  if (!cam) return
  const nextZoom = Math.min(MAX_CAMERA_ZOOM, Math.max(MIN_CAMERA_ZOOM, cam.zoom * factor))
  if (nextZoom === cam.zoom) return

  cam.zoom = nextZoom
  cam.updateProjectionMatrix()

  const worldAfter = view.screenToWorld(screen)
  cam.position.x += worldAnchor.x - worldAfter.x
  cam.position.y += worldAnchor.y - worldAfter.y
  cam.updateProjectionMatrix()
  syncMlightOrbitToCamera(view)
  notifyMlightViewChanged(view)
}

function notifyMlightViewChanged(view: AcTrView2d): void {
  ;(view as unknown as { _isDirty?: boolean })._isDirty = true
  view.events.viewChanged.dispatch()
}