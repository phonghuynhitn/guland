import type { Polygon } from 'geojson'
import { wgs84ToVn2000 } from '../lib/vn2000'
import {
  NEARBY_RADIUS_M,
  formatPricePerM2,
  listingsWithin,
  median,
  type Listing,
} from '../lib/listings'
import type { LandUseShare } from '../lib/landUse'

export type ParcelInfo = {
  geometry: Polygon
  areaM2: number
  centroid: { lat: number; lng: number }
}

type Props = {
  parcel: ParcelInfo | null
  mix: LandUseShare[] | 'loading' | null
  listings: Listing[]
  onStartDraw: () => void
}

export default function ParcelPanel({ parcel, mix, listings, onStartDraw }: Props) {
  if (!parcel) {
    return (
      <section className="panel-section">
        <p className="hint">
          Bấm biểu tượng đa giác góc trên phải, click từng đỉnh trên ảnh vệ tinh, click điểm đầu để đóng ranh thửa.
        </p>
        <button type="button" className="primary" onClick={onStartDraw}>
          Bắt đầu vẽ ranh
        </button>
      </section>
    )
  }

  const vn = wgs84ToVn2000(parcel.centroid.lat, parcel.centroid.lng)
  const nearby = listingsWithin(listings, parcel.centroid.lat, parcel.centroid.lng)
  const prices = nearby.map((x) => x.item.pricePerM2)

  return (
    <section className="panel-section">
      <div className="stat">
        <span className="muted">Diện tích</span>
        <strong>{Math.round(parcel.areaM2).toLocaleString('vi-VN')} m²</strong>
      </div>
      <div className="stat">
        <span className="muted">Tâm VN-2000</span>
        <strong>
          X {vn.x.toFixed(2)}
          <br />Y {vn.y.toFixed(2)}
        </strong>
      </div>

      <h3 className="subhead">Loại đất trong thửa</h3>
      {mix === 'loading' && <p className="muted">Đang giao thửa với vùng quy hoạch...</p>}
      {mix === null && <p className="muted">Không đọc được quy hoạch trong thửa.</p>}
      {Array.isArray(mix) && mix.length === 0 && <p className="muted">Chưa xác định được loại đất.</p>}
      {Array.isArray(mix) && mix.length > 0 && (
        <ul className="mix-list">
          {mix.map((row) => (
            <li key={row.color}>
              <span className="swatch" style={{ background: row.color }} />
              <span>
                <strong>{row.percent.toFixed(0)}%</strong>{' '}
                {row.items.length === 1 ? `${row.items[0].code} — ${row.items[0].name}` : row.items.map((i) => i.code).join(', ')}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="muted">
        Tỷ lệ là phần giao của thửa với từng mảnh. Phần vẽ vượt ranh phường được tính riêng, không kéo màu ra ngoài mép.
      </p>

      <h3 className="subhead">Giá xung quanh {NEARBY_RADIUS_M} m</h3>
      {prices.length === 0 ? (
        <p className="muted">Không có tin ảo trong bán kính này. Bật lớp tin rao ở tab Lớp bản đồ.</p>
      ) : (
        <>
          <p>
            {nearby.length} tin · min {formatPricePerM2(Math.min(...prices))} · trung vị{' '}
            {formatPricePerM2(median(prices))} · max {formatPricePerM2(Math.max(...prices))}
          </p>
          <ul className="price-list">
            {nearby.slice(0, 6).map(({ item, distanceM }) => (
              <li key={item.id}>
                <span>
                  <strong>{formatPricePerM2(item.pricePerM2)}</strong>
                  <span className="muted">
                    {' '}
                    · {item.areaM2} m² · {Math.round(distanceM)} m
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
