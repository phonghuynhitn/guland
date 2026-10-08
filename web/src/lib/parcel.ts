import area from '@turf/area'
import booleanPointInPolygon from '@turf/boolean-point-in-polygon'
import centroid from '@turf/centroid'
import { point, polygon } from '@turf/helpers'
import type { Polygon } from 'geojson'

function closedRing(ring: number[][]) {
  if (ring.length < 3) return ring
  const [fx, fy] = ring[0]
  const [lx, ly] = ring[ring.length - 1]
  return fx === lx && fy === ly ? ring : [...ring, ring[0]]
}

export function asPolygon(geometry: Polygon): Polygon {
  return { type: 'Polygon', coordinates: geometry.coordinates.map(closedRing) }
}

export function polygonAreaM2(geometry: Polygon) {
  return area(polygon(asPolygon(geometry).coordinates))
}

export function polygonCentroidLatLng(geometry: Polygon) {
  const c = centroid(polygon(asPolygon(geometry).coordinates))
  const [lng, lat] = c.geometry.coordinates
  return { lat, lng }
}

/** Lưới điểm nằm trong polygon, tối đa maxPoints (để ước lượng mix loại đất). */
export function gridInsidePolygon(geometry: Polygon, maxPoints = 64) {
  const poly = polygon(asPolygon(geometry).coordinates)
  const ring = geometry.coordinates[0]
  let minLng = Infinity
  let maxLng = -Infinity
  let minLat = Infinity
  let maxLat = -Infinity
  for (const [lng, lat] of ring) {
    minLng = Math.min(minLng, lng)
    maxLng = Math.max(maxLng, lng)
    minLat = Math.min(minLat, lat)
    maxLat = Math.max(maxLat, lat)
  }

  const found: { lat: number; lng: number }[] = []
  for (let n = 8; n <= 14 && found.length < 16; n++) {
    found.length = 0
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const lng = minLng + ((i + 0.5) / n) * (maxLng - minLng)
        const lat = minLat + ((j + 0.5) / n) * (maxLat - minLat)
        if (booleanPointInPolygon(point([lng, lat]), poly)) found.push({ lat, lng })
      }
    }
  }
  return found.slice(0, maxPoints)
}
