export type BaseLayer = 'satellite' | 'streets'

type Props = {
  base: BaseLayer
  onBaseChange: (base: BaseLayer) => void
  showPlanning: boolean
  onShowPlanningChange: (value: boolean) => void
  showBoundary: boolean
  onShowBoundaryChange: (value: boolean) => void
  showListings: boolean
  onShowListingsChange: (value: boolean) => void
  showLots: boolean
  onShowLotsChange: (value: boolean) => void
  onFocusLots: () => void
  opacity: number
  onOpacityChange: (value: number) => void
}

const BASE_OPTIONS: { value: BaseLayer; label: string }[] = [
  { value: 'satellite', label: 'Vệ tinh' },
  { value: 'streets', label: 'Đường phố' },
]

export default function LayerPanel({
  base,
  onBaseChange,
  showPlanning,
  onShowPlanningChange,
  showBoundary,
  onShowBoundaryChange,
  showListings,
  onShowListingsChange,
  showLots,
  onShowLotsChange,
  onFocusLots,
  opacity,
  onOpacityChange,
}: Props) {
  return (
    <section className="panel-section">
      <div className="segmented" role="radiogroup" aria-label="Bản đồ nền">
        {BASE_OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={base === o.value}
            className={base === o.value ? 'active' : ''}
            onClick={() => onBaseChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>

      <label className="opacity">
        <span>
          Độ đậm quy hoạch <strong>{Math.round(opacity * 100)}%</strong>
        </span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={opacity}
          disabled={!showPlanning}
          onChange={(e) => onOpacityChange(Number(e.target.value))}
        />
      </label>

      <label className="toggle">
        <input type="checkbox" checked={showPlanning} onChange={(e) => onShowPlanningChange(e.target.checked)} />
        <span>Vùng quy hoạch Tân Hưng</span>
      </label>
      <label className="toggle">
        <input type="checkbox" checked={showBoundary} onChange={(e) => onShowBoundaryChange(e.target.checked)} />
        <span>Ranh phường (khớp mép vùng tô)</span>
      </label>
      <label className="toggle">
        <input type="checkbox" checked={showLots} onChange={(e) => onShowLotsChange(e.target.checked)} />
        <span>Ô đất — số tờ, số thửa (giả)</span>
      </label>
      <button type="button" className="primary" onClick={onFocusLots}>
        Phóng tới các ô đất
      </button>
      <label className="toggle">
        <input type="checkbox" checked={showListings} onChange={(e) => onShowListingsChange(e.target.checked)} />
        <span>Tin rao (demo)</span>
      </label>
    </section>
  )
}
