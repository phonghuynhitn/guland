import type { CadViewer, Tool, ViewTransform } from '@cadview/core'

/** @cadview/core marks these @internal — used for unified canvas navigation */
export type CadViewerInternals = {
  handlePan(dx: number, dy: number): void
  handleZoom(screenX: number, screenY: number, factor: number): void
  handleClick(screenX: number, screenY: number): void
  requestRender(): void
  camera: { setTransform(vt: ViewTransform): void }
  getViewTransform(): ViewTransform
  setTool(tool: Tool): void
}

export function asCadInternals(viewer: CadViewer): CadViewerInternals {
  return viewer as unknown as CadViewerInternals
}

export function cloneViewTransform(vt: ViewTransform): ViewTransform {
  return { ...vt }
}