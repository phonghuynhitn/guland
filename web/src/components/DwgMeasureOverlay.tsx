import type { ViewTransform } from '@cadview/core'
import type { DwgMeasureState } from '../lib/dwgMeasure'
import { screenToWorldPoint, worldDistance, worldToScreenPoint } from '../lib/dwgMeasure'

type Props = {
  width: number
  height: number
  vt: ViewTransform | null
  state: DwgMeasureState
}

export default function DwgMeasureOverlay({ width, height, vt, state }: Props) {
  if (!vt || width <= 0 || height <= 0) return null
  if (state.kind === 'idle') return null

  if (state.kind === 'preview') {
    const p1 = worldToScreenPoint(vt, state.p1)
    const { cursor } = state
    const p2World = screenToWorldPoint(vt, cursor)
    const liveDist = worldDistance(state.p1, p2World)
    const midX = (p1.x + cursor.x) / 2
    const midY = (p1.y + cursor.y) / 2
    return (
      <svg className="dwg-measure-svg" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
        <line className="dwg-measure-line" x1={p1.x} y1={p1.y} x2={cursor.x} y2={cursor.y} />
        <circle className="dwg-measure-dot" cx={p1.x} cy={p1.y} r={4} />
        <circle className="dwg-measure-dot dwg-measure-dot--cursor" cx={cursor.x} cy={cursor.y} r={5} />
        <g className="dwg-measure-label" transform={`translate(${midX} ${midY - 10})`}>
          <rect x={-48} y={-16} width={96} height={18} rx={4} />
          <text y={-3} textAnchor="middle">
            {liveDist.toFixed(4)}
          </text>
        </g>
      </svg>
    )
  }

  const p1 = worldToScreenPoint(vt, state.p1)
  const p2 = worldToScreenPoint(vt, state.p2)
  const midX = (p1.x + p2.x) / 2
  const midY = (p1.y + p2.y) / 2

  return (
    <svg className="dwg-measure-svg" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      <line className="dwg-measure-line dwg-measure-line--done" x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} />
      <circle className="dwg-measure-dot" cx={p1.x} cy={p1.y} r={4} />
      <circle className="dwg-measure-dot" cx={p2.x} cy={p2.y} r={4} />
      <g className="dwg-measure-label" transform={`translate(${midX} ${midY - 10})`}>
        <rect x={-48} y={-16} width={96} height={18} rx={4} />
        <text y={-3} textAnchor="middle">
          {state.distance.toFixed(4)}
        </text>
      </g>
    </svg>
  )
}