import { useEffect } from 'react'

type Props = {
  zones: string[]
  target: string
  onTarget: (value: string) => void
  drawing: boolean
  draftCount: number
  hasOutline: boolean
  onDraw: () => void
  onFinish: () => void
  onUndo: () => void
  onCancelDraw: () => void
  onClearOutline: () => void
  dragLayer: boolean
  onDragLayer: (value: boolean) => void
  opacity: number
  onOpacity: (value: number) => void
  step: number
  onStep: (value: number) => void
  onNudge: (east: number, north: number) => void
  onScale: (factor: number) => void
  onStretchAcross: (factor: number) => void
  onStretchAlong: (factor: number) => void
  onRotate: (degrees: number) => void
  east: number
  north: number
  scale: number
  scaleAcross: number
  scaleAlong: number
  rotation: number
  onReset: () => void
  onSave: () => void
  onCopy: () => void
  saved: boolean
  copied: boolean
}

const STEPS = [1, 5, 20]

export default function AlignPanel({
  zones,
  target,
  onTarget,
  drawing,
  draftCount,
  hasOutline,
  onDraw,
  onFinish,
  onUndo,
  onCancelDraw,
  onClearOutline,
  dragLayer,
  onDragLayer,
  opacity,
  onOpacity,
  step,
  onStep,
  onNudge,
  onScale,
  onStretchAcross,
  onStretchAlong,
  onRotate,
  east,
  north,
  scale,
  scaleAcross,
  scaleAlong,
  rotation,
  onReset,
  onSave,
  onCopy,
  saved,
  copied,
}: Props) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const field = event.target as HTMLElement
      if (field.closest('input, select, textarea')) return
      if (drawing) {
        if (event.key === 'Enter' && draftCount >= 3) onFinish()
        else if (event.key === 'Escape') onCancelDraw()
        else if (event.key === 'Backspace') onUndo()
        else return
        event.preventDefault()
        return
      }
      if (event.key === 'ArrowUp') onNudge(0, step)
      else if (event.key === 'ArrowDown') onNudge(0, -step)
      else if (event.key === 'ArrowLeft') onNudge(-step, 0)
      else if (event.key === 'ArrowRight') onNudge(step, 0)
      else return
      event.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drawing, draftCount, onCancelDraw, onFinish, onNudge, onUndo, step])

  return (
    <aside className="align-panel">
      <h2>Căn chỉnh lớp lô</h2>
      <label className="field">
        Đang căn
        <select value={target} onChange={(event) => onTarget(event.target.value)} aria-label="Phân khu cần căn">
          <option value="all">Cả dự án</option>
          {zones.map((zone) => (
            <option key={zone} value={zone}>
              {zone}
            </option>
          ))}
        </select>
      </label>
      <p className="hint">
        {target === 'all'
          ? 'Bản vẽ hẹp hơn mặt đất. Khớp một mép thì mép kia bị hụt — chọn từng phân khu để căn riêng.'
          : 'Lô có tâm nằm trong ranh thuộc phân khu này. Nền và tiện ích trong ranh chỉ tách ra khi phân khu đang lệch, rồi đi theo.'}
      </p>
      {target !== 'all' && (
        <>
          <div className="tune">
            {drawing ? (
              <>
                <button type="button" className="on" onClick={onFinish} disabled={draftCount < 3}>
                  Xong
                </button>
                <button type="button" onClick={onUndo} disabled={draftCount === 0}>
                  Xóa điểm
                </button>
                <button type="button" onClick={onCancelDraw}>
                  Hủy
                </button>
              </>
            ) : (
              <>
                <button type="button" onClick={onDraw}>
                  Vẽ ranh
                </button>
                <button type="button" onClick={onClearOutline} disabled={!hasOutline}>
                  Xóa ranh
                </button>
              </>
            )}
          </div>
          <p className="hint">
            {drawing
              ? `Đã ${draftCount} điểm. Bấm bao hết lô và tiện ích, rồi bấm Xong.`
              : hasOutline
                ? 'Đã có ranh. Mọi lô trong ranh đi theo phân khu này. Ảnh trong ranh đi theo khi phân khu lệch.'
                : 'Chưa có ranh. Vẽ bao các lô và tiện ích. Lô trong ranh sẽ thuộc phân khu này.'}
          </p>
        </>
      )}
      <div className="seg">
        <button type="button" className={dragLayer ? 'on' : ''} onClick={() => onDragLayer(true)}>
          Kéo lớp lô
        </button>
        <button type="button" className={dragLayer ? '' : 'on'} onClick={() => onDragLayer(false)}>
          Kéo bản đồ
        </button>
      </div>
      <label className="field">
        Độ trong {Math.round(opacity * 100)}%
        <input type="range" min={0.15} max={1} step={0.05} value={opacity} onChange={(event) => onOpacity(Number(event.target.value))} />
      </label>
      <div className="steps">
        {STEPS.map((value) => (
          <button key={value} type="button" className={step === value ? 'on' : ''} onClick={() => onStep(value)}>
            {value} m
          </button>
        ))}
      </div>
      <div className="pad">
        <button type="button" style={{ gridArea: 'n' }} onClick={() => onNudge(0, step)} aria-label="Dịch bắc">
          ↑
        </button>
        <button type="button" style={{ gridArea: 'w' }} onClick={() => onNudge(-step, 0)} aria-label="Dịch tây">
          ←
        </button>
        <button type="button" style={{ gridArea: 'e' }} onClick={() => onNudge(step, 0)} aria-label="Dịch đông">
          →
        </button>
        <button type="button" style={{ gridArea: 's' }} onClick={() => onNudge(0, -step)} aria-label="Dịch nam">
          ↓
        </button>
      </div>
      <div className="tune">
        <span>Tỷ lệ</span>
        <button type="button" onClick={() => onScale(0.99)}>
          −1%
        </button>
        <button type="button" onClick={() => onScale(0.998)}>
          −0.2%
        </button>
        <button type="button" onClick={() => onScale(1.002)}>
          +0.2%
        </button>
        <button type="button" onClick={() => onScale(1.01)}>
          +1%
        </button>
      </div>
      <div className="tune">
        <span>Ngang</span>
        <button type="button" onClick={() => onStretchAcross(0.99)}>
          −1%
        </button>
        <button type="button" onClick={() => onStretchAcross(0.998)}>
          −0.2%
        </button>
        <button type="button" onClick={() => onStretchAcross(1.002)}>
          +0.2%
        </button>
        <button type="button" onClick={() => onStretchAcross(1.01)}>
          +1%
        </button>
      </div>
      <div className="tune">
        <span>Dài</span>
        <button type="button" onClick={() => onStretchAlong(0.99)}>
          −1%
        </button>
        <button type="button" onClick={() => onStretchAlong(0.998)}>
          −0.2%
        </button>
        <button type="button" onClick={() => onStretchAlong(1.002)}>
          +0.2%
        </button>
        <button type="button" onClick={() => onStretchAlong(1.01)}>
          +1%
        </button>
      </div>
      <div className="tune">
        <span>Xoay</span>
        <button type="button" onClick={() => onRotate(-0.5)}>
          ↺ 0.5°
        </button>
        <button type="button" onClick={() => onRotate(-0.1)}>
          ↺ 0.1°
        </button>
        <button type="button" onClick={() => onRotate(0.1)}>
          ↻ 0.1°
        </button>
        <button type="button" onClick={() => onRotate(0.5)}>
          ↻ 0.5°
        </button>
      </div>
      <p className="readout">
        {target === 'all' ? 'Đông' : 'Thêm đông'} {east.toFixed(1)} m · {target === 'all' ? 'Bắc' : 'thêm bắc'} {north.toFixed(1)} m
        <br />
        Tỷ lệ ×{scale.toFixed(3)} · Ngang ×{scaleAcross.toFixed(3)} · Dài ×{scaleAlong.toFixed(3)}
        <br />
        Xoay {rotation.toFixed(2)}°
      </p>
      <div className="tune">
        <button type="button" onClick={onSave}>
          {saved ? 'Đã lưu' : 'Lưu cấu hình'}
        </button>
      </div>
      <div className="tune">
        <button type="button" onClick={onReset}>
          Đưa về gốc
        </button>
        <button type="button" onClick={onCopy}>
          {copied ? 'Đã chép' : 'Sao chép thông số'}
        </button>
      </div>
      <p className="hint">Đưa về gốc xóa căn của mục đang chọn, không xóa ranh. Lưu ghi vào trang. Chưa lưu thì vẫn nhớ trên máy này.</p>
    </aside>
  )
}
