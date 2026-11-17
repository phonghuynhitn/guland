import type { ViewTransform } from '@cadview/core'
import { screenToWorld, worldToScreen } from '@cadview/core'

export type ScreenPoint = { x: number; y: number }
export type WorldPoint = { x: number; y: number }

export type DwgMeasureState =
  | { kind: 'idle' }
  | { kind: 'preview'; p1: WorldPoint; cursor: ScreenPoint }
  | { kind: 'done'; p1: WorldPoint; p2: WorldPoint; distance: number }

export function canvasLocalPoint(canvas: HTMLCanvasElement, clientX: number, clientY: number): ScreenPoint {
  const rect = canvas.getBoundingClientRect()
  return { x: clientX - rect.left, y: clientY - rect.top }
}

export function screenToWorldPoint(vt: ViewTransform, point: ScreenPoint): WorldPoint {
  const [x, y] = screenToWorld(vt, point.x, point.y)
  return { x, y }
}

export function worldToScreenPoint(vt: ViewTransform, point: WorldPoint): ScreenPoint {
  const [x, y] = worldToScreen(vt, point.x, point.y)
  return { x, y }
}

export function worldDistance(a: WorldPoint, b: WorldPoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y)
}