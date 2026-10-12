import { useMemo, useState } from 'react'
import type { LegendItem } from '../lib/landUse'

const GROUP_LABELS: Record<string, string> = {
  residential: 'Đất ở',
  commercial: 'Thương mại, sản xuất',
  public: 'Công trình công cộng',
  green: 'Cây xanh',
  transport: 'Giao thông',
  water: 'Mặt nước, thủy lợi',
  agriculture: 'Nông nghiệp',
  defense: 'Quốc phòng, an ninh',
  unused: 'Chưa sử dụng',
}

export default function Legend({ items }: { items: LegendItem[] }) {
  const [query, setQuery] = useState('')

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = q
      ? items.filter((i) => i.code.toLowerCase().includes(q) || i.name.toLowerCase().includes(q))
      : items
    return Object.keys(GROUP_LABELS)
      .map((key) => ({ key, items: filtered.filter((i) => i.group === key) }))
      .filter((g) => g.items.length > 0)
  }, [items, query])

  return (
    <section className="panel-section legend">
      <input
        className="legend-search"
        type="search"
        placeholder="Tìm loại đất (MN, CX, TMD...)"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {groups.map((g) => (
        <div key={g.key} className="legend-group">
          <h3>{GROUP_LABELS[g.key]}</h3>
          <ul>
            {g.items.map((i) => (
              <li key={i.code}>
                <span className="swatch" style={{ background: i.color }} />
                <code>{i.code}</code>
                <span>{i.name}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {groups.length === 0 && <p className="muted">Không tìm thấy mã đất phù hợp</p>}
    </section>
  )
}
