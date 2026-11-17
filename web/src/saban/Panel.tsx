import { useEffect, useState } from 'react'
import {
  PRODUCT_ORDER,
  STATUS_META,
  STATUS_ORDER,
  SWATCHES,
  lotStatus,
  swatchOf,
  zoneName,
  type ColorMode,
  type LotFeature,
  type SaleStatus,
  type ZoneId,
} from './model'

type Props = {
  open: boolean
  onToggleOpen: () => void
  query: string
  onQueryChange: (value: string) => void
  onSearch: () => void
  searchNote: string | null
  colorMode: ColorMode
  onColorMode: (mode: ColorMode) => void
  hiddenSwatches: string[]
  onToggleSwatch: (id: string) => void
  hiddenStatuses: SaleStatus[]
  onToggleStatus: (status: SaleStatus) => void
  counts: Record<string, number>
  statusCounts: Record<SaleStatus, number>
  shown: number
  total: number
  results: LotFeature[]
  resultNote: string | null
  selected: LotFeature | null
  statuses: Record<string, SaleStatus>
  onSelect: (id: string) => void
  onStatus: (id: string, status: SaleStatus) => void
  onZone: (zone: 'all' | ZoneId) => void
  editing: boolean
  onToggleEditing: () => void
  drawing: boolean
  onToggleDrawing: () => void
  shaping: boolean
  onToggleShaping: () => void
  onRename: (id: string, next: string) => string | null
  onDelete: (id: string) => void
  onDownload: () => void
}

export default function Panel(props: Props) {
  return (
    <aside className={`panel ${props.open ? 'open' : 'collapsed'}`}>
      <header className="panel-header">
        <div>
          <h1>Dragon Park / River</h1>
          <p>Sa bàn phân lô</p>
        </div>
        <button type="button" className="panel-toggle" onClick={props.onToggleOpen}>
          {props.open ? 'Thu gọn' : 'Mở'}
        </button>
      </header>
      {props.open && (
        <>
          <div className="panel-body">
            <form
              className="search"
              onSubmit={(event) => {
                event.preventDefault()
                props.onSearch()
              }}
            >
              <input
                value={props.query}
                onChange={(event) => props.onQueryChange(event.target.value)}
                placeholder="Tìm mã, ví dụ PARK 12 5"
                aria-label="Tìm mã lô"
              />
              <button type="submit">Tới lô</button>
            </form>
            {props.searchNote && <p className="note">{props.searchNote}</p>}

            <div className="zone-row">
              <button type="button" onClick={() => props.onZone('all')}>
                Toàn dự án
              </button>
              <button type="button" onClick={() => props.onZone('park')}>
                Dragon Park
              </button>
              <button type="button" onClick={() => props.onZone('river')}>
                Dragon River
              </button>
            </div>

            <div className="segmented">
              <button type="button" className={props.colorMode === 'product' ? 'active' : ''} onClick={() => props.onColorMode('product')}>
                Loại sản phẩm
              </button>
              <button type="button" className={props.colorMode === 'status' ? 'active' : ''} onClick={() => props.onColorMode('status')}>
                Trạng thái bán
              </button>
            </div>

            <section>
              <h2>Chú giải</h2>
              {PRODUCT_ORDER.map((product) => {
                const items = SWATCHES.filter((item) => item.product === product)
                return (
                  <div key={product} className="legend-group">
                    <h3>{items[0].productLabel}</h3>
                    {items.map((item) => {
                      const off = props.hiddenSwatches.includes(item.id)
                      return (
                        <button type="button" key={item.id} className={off ? 'swatch off' : 'swatch'} onClick={() => props.onToggleSwatch(item.id)}>
                          <i style={{ background: item.color }} />
                          <span>
                            {item.variantLabel}
                            <small>{item.sizeLabel}</small>
                          </span>
                          <em>{props.counts[item.id] ?? 0}</em>
                        </button>
                      )
                    })}
                  </div>
                )
              })}
            </section>

            <section>
              <h2>Trạng thái</h2>
              <div className="status-grid">
                {STATUS_ORDER.map((status) => {
                  const meta = STATUS_META[status]
                  const off = props.hiddenStatuses.includes(status)
                  return (
                    <button type="button" key={status} className={off ? 'status off' : 'status'} onClick={() => props.onToggleStatus(status)}>
                      <i style={{ background: meta.color }} />
                      {meta.label}
                      <em>{props.statusCounts[status]}</em>
                    </button>
                  )
                })}
              </div>
              <p className="note">
                Đang hiện {props.shown.toLocaleString('vi-VN')} / {props.total.toLocaleString('vi-VN')} lô
              </p>
            </section>

            {props.selected && (
              <LotCard
                lot={props.selected}
                status={lotStatus(props.statuses, props.selected.properties.id)}
                editing={props.editing}
                shaping={props.shaping}
                onStatus={(status) => props.onStatus(props.selected!.properties.id, status)}
                onRename={(next) => props.onRename(props.selected!.properties.id, next)}
                onToggleShaping={props.onToggleShaping}
                onDelete={() => props.onDelete(props.selected!.properties.id)}
              />
            )}

            <section>
              <h2>Danh sách</h2>
              {props.resultNote && <p className="note">{props.resultNote}</p>}
              <ul className="lot-list">
                {props.results.map((lot) => (
                  <li key={lot.properties.id}>
                    <button type="button" className={props.selected?.properties.id === lot.properties.id ? 'active' : ''} onClick={() => props.onSelect(lot.properties.id)}>
                      <i style={{ background: props.colorMode === 'status' ? STATUS_META[lotStatus(props.statuses, lot.properties.id)].color : lot.properties.color }} />
                      <span>
                        <strong>{lot.properties.id}</strong>
                        <small>
                          {swatchOf(lot.properties.swatch).productLabel} · {lot.properties.areaM2.toLocaleString('vi-VN')} m²
                        </small>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>

            <section className="edit-block">
              <h2>Chỉnh ranh</h2>
              <button type="button" className={props.editing ? 'primary' : ''} onClick={props.onToggleEditing}>
                {props.editing ? 'Xong chỉnh' : 'Bật chế độ chỉnh'}
              </button>
              {props.editing && (
                <div className="edit-actions">
                  <button type="button" className={props.drawing ? 'primary' : ''} onClick={props.onToggleDrawing}>
                    {props.drawing ? 'Đang vẽ…' : 'Vẽ lô'}
                  </button>
                  <button type="button" onClick={props.onDownload}>
                    Tải GeoJSON
                  </button>
                </div>
              )}
              <p className="note">Mã lô đánh tạm theo dãy. Kéo đỉnh khi đang sửa lô được chọn, rồi tải file để thay dữ liệu.</p>
            </section>
          </div>
          <footer className="panel-footer">
            Ranh tách từ ảnh mặt bằng, chưa có bảng hàng. <a href="/">Demo quy hoạch Tân Hưng</a>
          </footer>
        </>
      )}
    </aside>
  )
}

function LotCard({
  lot,
  status,
  editing,
  shaping,
  onStatus,
  onRename,
  onToggleShaping,
  onDelete,
}: {
  lot: LotFeature
  status: SaleStatus
  editing: boolean
  shaping: boolean
  onStatus: (status: SaleStatus) => void
  onRename: (next: string) => string | null
  onToggleShaping: () => void
  onDelete: () => void
}) {
  const [code, setCode] = useState(lot.properties.id)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    setCode(lot.properties.id)
    setError(null)
  }, [lot.properties.id])
  const spec = swatchOf(lot.properties.swatch)
  return (
    <section className="lot-card">
      <h2>Lô đang chọn</h2>
      {editing ? (
        <form
          className="rename"
          onSubmit={(event) => {
            event.preventDefault()
            const message = onRename(code)
            setError(message)
          }}
        >
          <input value={code} onChange={(event) => setCode(event.target.value)} aria-label="Mã lô" />
          <button type="submit">Đổi mã</button>
        </form>
      ) : (
        <p className="lot-code">{lot.properties.id}</p>
      )}
      {error && <p className="note warn">{error}</p>}
      <dl>
        <div>
          <dt>Phân khu</dt>
          <dd>{zoneName(lot.properties.zone)}</dd>
        </div>
        <div>
          <dt>Loại</dt>
          <dd>
            {spec.productLabel} · {spec.variantLabel}
          </dd>
        </div>
        <div>
          <dt>Kích thước</dt>
          <dd>{lot.properties.sizeLabel}</dd>
        </div>
        <div>
          <dt>Diện tích</dt>
          <dd>{lot.properties.areaM2.toLocaleString('vi-VN')} m²</dd>
        </div>
      </dl>
      <div className="status-grid">
        {STATUS_ORDER.map((item) => (
          <button type="button" key={item} className={status === item ? 'status on' : 'status'} onClick={() => onStatus(item)}>
            <i style={{ background: STATUS_META[item].color }} />
            {STATUS_META[item].label}
          </button>
        ))}
      </div>
      {editing && (
        <div className="edit-actions">
          <button type="button" className={shaping ? 'primary' : ''} onClick={onToggleShaping}>
            {shaping ? 'Đang sửa đỉnh' : 'Sửa đỉnh'}
          </button>
          <button type="button" className="danger" onClick={onDelete}>
            Xóa lô
          </button>
        </div>
      )}
    </section>
  )
}
