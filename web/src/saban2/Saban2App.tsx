import { useEffect, useMemo, useState } from 'react'
import Saban2Map from './Saban2Map'
import { LOTS_URL, META_URL, isLotCollection, searchLots, type LotFeature, type PlanMeta } from './model'

const LIST_LIMIT = 80

export default function Saban2App() {
  const [meta, setMeta] = useState<PlanMeta | null>(null)
  const [lots, setLots] = useState<LotFeature[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [searchNote, setSearchNote] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [focusNonce, setFocusNonce] = useState(0)
  const [open, setOpen] = useState(() => window.innerWidth > 640)

  useEffect(() => {
    let cancelled = false
    Promise.all([fetch(META_URL).then((response) => response.json()), fetch(LOTS_URL).then((response) => response.json())])
      .then(([plan, collection]: [PlanMeta, unknown]) => {
        if (cancelled) return
        if (!isLotCollection(collection)) throw new Error('lots')
        const features = collection.features as LotFeature[]
        setMeta(plan)
        setLots(features)
        const requested = new URLSearchParams(window.location.search).get('lot')
        if (requested) {
          const found = features.find((lot) => lot.properties.id.toLowerCase() === requested.toLowerCase())
          if (found) {
            setSelectedId(found.properties.id)
            setFocusNonce(1)
          } else {
            setSearchNote(`Không có lô ${requested}`)
          }
        }
      })
      .catch(() => {
        if (!cancelled) setLoadError('Không tải được mặt bằng.')
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!meta) return
    const url = new URL(window.location.href)
    if (selectedId) url.searchParams.set('lot', selectedId)
    else url.searchParams.delete('lot')
    window.history.replaceState(null, '', `${url.pathname}${url.search}`)
  }, [selectedId, meta])

  const results = useMemo(() => {
    if (query.trim()) return searchLots(lots, query).slice(0, LIST_LIMIT)
    return lots.filter((lot) => lot.properties.closed).slice(0, LIST_LIMIT)
  }, [lots, query])

  const select = (id: string) => {
    setSelectedId(id)
    setFocusNonce((value) => value + 1)
    setSearchNote(null)
    if (window.innerWidth <= 640) setOpen(true)
  }

  const onSearch = () => {
    const found = searchLots(lots, query)
    if (!query.trim()) return
    if (found.length === 1) {
      select(found[0].properties.id)
      return
    }
    setSearchNote(found.length === 0 ? 'Không có mã này trên layer Solo.' : 'Nhiều lô cùng mã. Chọn một dòng trong danh sách.')
  }

  if (!meta) return <div className="boot">{loadError ?? 'Đang tải mặt bằng...'}</div>

  const selected = lots.find((lot) => lot.properties.id === selectedId) ?? null
  const resultNote = query.trim()
    ? results.length === 0
      ? 'Không có mã này trên layer Solo.'
      : null
    : lots.length > LIST_LIMIT
      ? `Danh sách đang hiện ${LIST_LIMIT} lô có ranh. Gõ mã, ví dụ 12.`
      : null

  return (
    <div className="plan">
      <Saban2Map
        meta={meta}
        lots={lots}
        selectedId={selected?.properties.id ?? null}
        focusNonce={focusNonce}
        panelOpen={open}
        onSelect={select}
      />
      <aside className={`panel ${open ? 'open' : 'collapsed'}`}>
        <header className="panel-header">
          <div>
            <h1>Sa bàn 2</h1>
            <p>{meta.title}</p>
          </div>
          <button type="button" className="panel-toggle" onClick={() => setOpen((value) => !value)}>
            {open ? 'Thu gọn' : 'Mở'}
          </button>
        </header>
        {open && (
          <>
            <div className="panel-body">
              <form
                className="search"
                onSubmit={(event) => {
                  event.preventDefault()
                  onSearch()
                }}
              >
                <input
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value)
                    setSearchNote(null)
                  }}
                  placeholder="Tìm mã lô, ví dụ 12"
                  aria-label="Tìm mã lô"
                />
                <button type="submit">Tới lô</button>
              </form>
              {searchNote && <p className="note">{searchNote}</p>}
              <p className="note">
                Bấm được {meta.closed.toLocaleString('vi-VN')} lô. {meta.open.toLocaleString('vi-VN')} mã trên layer Solo chưa có ranh kín.
              </p>
              {selected && (
                <section className="lot-card">
                  <h2>Đang chọn</h2>
                  <p className="lot-code">{selected.properties.code}</p>
                  <dl>
                    <div>
                      <dt>Mã trên bản vẽ</dt>
                      <dd>{selected.properties.code}</dd>
                    </div>
                    <div>
                      <dt>Layer chữ</dt>
                      <dd>{selected.properties.layer}</dd>
                    </div>
                    <div>
                      <dt>Ranh</dt>
                      <dd>{selected.properties.closed ? selected.properties.boundary : 'Chưa khép'}</dd>
                    </div>
                    {selected.properties.closed && selected.properties.areaM2 != null && (
                      <div>
                        <dt>Diện tích đo từ ranh</dt>
                        <dd>{selected.properties.areaM2.toLocaleString('vi-VN')} m²</dd>
                      </div>
                    )}
                  </dl>
                  {!selected.properties.closed && (
                    <p className="note">Chữ mã nằm trên bản vẽ, nhưng nét layer Phanlo chưa khép thành một lô quanh nó.</p>
                  )}
                </section>
              )}
              <section>
                <h2>Danh sách</h2>
                {resultNote && <p className="note">{resultNote}</p>}
                <ul className="lot-list">
                  {results.map((lot) => (
                    <li key={lot.properties.id}>
                      <button
                        type="button"
                        className={selected?.properties.id === lot.properties.id ? 'active' : ''}
                        onClick={() => select(lot.properties.id)}
                      >
                        <span>
                          <strong>{lot.properties.code}</strong>
                          <small>
                            {lot.properties.closed
                              ? `${lot.properties.areaM2?.toLocaleString('vi-VN')} m²`
                              : 'Chưa có ranh kín'}
                          </small>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
            <footer className="panel-footer">
              Nguồn: file DWG phân lô PA2. Ranh bấm được là mặt kín tạo bởi layer Phanlo và Leduong. Mã lấy từ layer Solo.
            </footer>
          </>
        )}
      </aside>
    </div>
  )
}
