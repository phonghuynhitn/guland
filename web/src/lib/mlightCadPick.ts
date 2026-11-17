import type { AcTrView2d } from '@mlightcad/cad-simple-viewer'

/** Pixel half-size for lot picking (small closed polylines on PA2 plans). */
export const MLIGHT_PICK_HIT_RADIUS_PX = 14

export function pickEntityIdAtCanvas(
  view: AcTrView2d,
  canvasPoint: { x: number; y: number },
): string | null {
  const world = view.screenToWorld(canvasPoint)
  const hits = view.pick(world, MLIGHT_PICK_HIT_RADIUS_PX, true)
  return hits[0]?.id ?? null
}

export function applyLotSelection(view: AcTrView2d, id: string | null): void {
  if (id) {
    view.htmlTransientManager.deselectAll()
    view.applySelection([id], 'replace')
    return
  }
  view.selectionSet.clear()
}

export function setHoverEntity(view: AcTrView2d, id: string | null, previousId: string | null): string | null {
  if (previousId && previousId !== id) {
    view.onUnhover(previousId)
  }
  if (id && id !== previousId) {
    view.onHover(id)
  }
  return id
}

export function clearHoverEntity(view: AcTrView2d, id: string | null): void {
  if (id) view.onUnhover(id)
}