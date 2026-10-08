import L from 'leaflet'
import { CircleMarker, Popup } from 'react-leaflet'
import { formatPricePerM2, formatVnd, markerRadius, priceColor, type Listing } from '../lib/listings'

type Props = {
  listings: Listing[]
  min: number
  max: number
}

export default function PriceLayer({ listings, min, max }: Props) {
  return (
    <>
      {listings.map((item) => (
        <CircleMarker
          key={item.id}
          center={[item.lat, item.lng]}
          radius={markerRadius(item.areaM2)}
          pathOptions={{
            color: '#fff',
            weight: 1.25,
            fillColor: priceColor(item.pricePerM2, min, max),
            fillOpacity: 0.92,
          }}
          eventHandlers={{
            click(e) {
              L.DomEvent.stopPropagation(e)
            },
          }}
        >
          <Popup>
            <div className="popup">
              <strong>{item.title}</strong>
              <p className="popup-muted">{item.address}</p>
              <table>
                <tbody>
                  <tr>
                    <th>Giá</th>
                    <td>{formatPricePerM2(item.pricePerM2)}</td>
                  </tr>
                  <tr>
                    <th>Diện tích</th>
                    <td>{item.areaM2} m²</td>
                  </tr>
                  <tr>
                    <th>Thành tiền</th>
                    <td>{formatVnd(item.pricePerM2 * item.areaM2)}</td>
                  </tr>
                </tbody>
              </table>
              <p className="popup-note">Tin ảo để demo, không dùng để giao dịch.</p>
            </div>
          </Popup>
        </CircleMarker>
      ))}
    </>
  )
}
