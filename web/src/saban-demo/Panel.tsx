import { STATUS_META, STATUS_ORDER, khuOf, type Lot, type SaleStatus } from './model'

type Props = {
  open: boolean
  onToggle: () => void
  query: string
  onQuery: (value: string) => void
  onSearch: () => void
  note: string | null
  zone: string
  zones: string[]
  onZone: (zone: string) => void
  active: SaleStatus[]
  onToggleStatus: (status: SaleStatus) => void
  counts: Record<SaleStatus, number>
  results: Lot[]
  selectedId: string | null
  onSelect: (id: string) => void
}

export default function Panel({
  open,
  onToggle,
  query,
  onQuery,
  onSearch,
  note,
  zone,
  zones,
  onZone,
  active,
  onToggleStatus,
  counts,
  results,
  selectedId,
  onSelect,
}: Props) {
  return (
    <aside className={`filter ${open ? 'open' : 'shut'}`}>
      <header>
        <h2>Tìm kiếm</h2>
        <button type="button" onClick={onToggle} aria-label={open ? 'Thu gọn' : 'Mở bộ lọc'}>
          {open ? '–' : '+'}
        </button>
      </header>
      {open && (
        <>
          <form
            onSubmit={(event) => {
              event.preventDefault()
              onSearch()
            }}
          >
            <input
              value={query}
              onChange={(event) => onQuery(event.target.value)}
              placeholder="Mã lô, ví dụ A1-01"
              aria-label="Tìm mã lô"
            />
            <button type="submit">Tìm</button>
          </form>
          {note && <p className="hint">{note}</p>}
          <section>
            <h3>Bộ lọc</h3>
            <label className="field">
              Phân khu
              <select value={zone} onChange={(event) => onZone(event.target.value)} aria-label="Phân khu">
                <option value="all">Tất cả</option>
                {zones.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <h3>Trạng thái</h3>
            <ul>
              {STATUS_ORDER.map((status) => (
                <li key={status}>
                  <label>
                    <input type="checkbox" checked={active.includes(status)} onChange={() => onToggleStatus(status)} />
                    <i style={{ background: STATUS_META[status].color }} />
                    <span>{STATUS_META[status].label}</span>
                    <b>{counts[status].toLocaleString('vi-VN')}</b>
                  </label>
                </li>
              ))}
            </ul>
            <p className="hint">Chưa chọn trạng thái thì mọi lô hiện viền trắng, nền vàng nhạt. Tích một trạng thái để lọc theo màu. Trạng thái là dữ liệu demo, không lấy từ hệ thống bán hàng.</p>
          </section>
          {results.length > 0 && (
            <section>
              <h3>Kết quả</h3>
              <ul className="hits">
                {results.slice(0, 40).map((lot) => (
                  <li key={lot.id}>
                    <button type="button" className={lot.id === selectedId ? 'on' : ''} onClick={() => onSelect(lot.id)}>
                      <strong>{lot.code}</strong>
                      <small>
                        {khuOf(lot.code)} · {lot.zone || '—'}
                      </small>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </aside>
  )
}
