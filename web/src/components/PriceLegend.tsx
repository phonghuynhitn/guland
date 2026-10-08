import { formatPricePerM2, priceColor, type Listing } from '../lib/listings'

type Props = {
  listings: Listing[]
  min: number
  max: number
}

export default function PriceLegend({ listings, min, max }: Props) {
  const mid = (min + max) / 2
  const top = [...listings].sort((a, b) => b.pricePerM2 - a.pricePerM2).slice(0, 8)

  return (
    <section className="panel-section">
      <p className="muted">
        {listings.length} tin ảo trong quận Cầu Giấy. Màu chấm: xanh rẻ hơn, đỏ đắt hơn (đ/m²).
      </p>
      <div className="price-scale">
        <div className="price-scale-bar" />
        <div className="price-scale-labels">
          <span>{formatPricePerM2(min)}</span>
          <span>{formatPricePerM2(mid)}</span>
          <span>{formatPricePerM2(max)}</span>
        </div>
      </div>
      <h3 className="subhead">Tin giá cao</h3>
      <ul className="price-list">
        {top.map((item) => (
          <li key={item.id}>
            <span className="dot" style={{ background: priceColor(item.pricePerM2, min, max) }} />
            <span>
              <strong>{formatPricePerM2(item.pricePerM2)}</strong>
              <span className="muted">
                {' '}
                · {item.areaM2} m² · {item.address}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
