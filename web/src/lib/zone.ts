import area from '@turf/area'
import booleanPointInPolygon from '@turf/boolean-point-in-polygon'
import intersect from '@turf/intersect'
import { featureCollection, point } from '@turf/helpers'
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson'
import type { LandUseShare, LegendItem } from './landUse'

export type ZoneProps = LegendItem & {
  kind: string
  areaM2?: number
}

export type ZoneFeature = Feature<Polygon | MultiPolygon, ZoneProps>

export type AreaMeta = {
  id: string
  title: string
  subtitle: string
  center: [number, number]
  bounds: [number, number, number, number]
  meridianLabel: string
  checks: { side: string; edge: string }[]
}

const PICK_FIRST = ['water', 'park', 'public', 'industrial', 'commercial', 'residential', 'rest']

export function legendFromZones(features: ZoneFeature[]): LegendItem[] {
  const seen = new Map<string, LegendItem>()
  for (const feature of features) {
    const { code, name, color, group } = feature.properties
    if (!seen.has(code)) seen.set(code, { code, name, color, group })
  }
  return [...seen.values()]
}

export function pickZone(features: ZoneFeature[], lat: number, lng: number): ZoneFeature | null {
  const here = point([lng, lat])
  const hits = features.filter((feature) => booleanPointInPolygon(here, feature))
  if (hits.length === 0) return null
  hits.sort((a, b) => PICK_FIRST.indexOf(a.properties.kind) - PICK_FIRST.indexOf(b.properties.kind))
  return hits[0]
}

function asFeature(geometry: Polygon): Feature<Polygon> {
  return { type: 'Feature', properties: {}, geometry }
}

/** Phần giao thửa với từng mảnh. Mảnh không tràn ra ngoài ranh vì dữ liệu đã cắt sẵn. */
export function zoneMix(features: ZoneFeature[], geometry: Polygon): LandUseShare[] {
  const parcel = asFeature(geometry)
  const parcelArea = area(parcel)
  if (parcelArea <= 0) return []

  const rows: LandUseShare[] = []
  let inside = 0
  for (const feature of features) {
    let hit: Feature<Polygon | MultiPolygon> | null = null
    try {
      hit = intersect(featureCollection([parcel, feature]))
    } catch {
      hit = null
    }
    if (!hit || (hit.geometry.type !== 'Polygon' && hit.geometry.type !== 'MultiPolygon')) continue
    const meters = area(hit)
    if (meters < 1) continue
    inside += meters
    rows.push({
      color: feature.properties.color,
      items: [feature.properties],
      count: 1,
      percent: (meters / parcelArea) * 100,
    })
  }

  const outside = Math.max(0, parcelArea - inside)
  if (outside > parcelArea * 0.01) {
    rows.push({
      color: '#e2e8f0',
      items: [{ code: '—', name: 'Ngoài ranh phường', color: '#e2e8f0', group: 'unused' }],
      count: 1,
      percent: (outside / parcelArea) * 100,
    })
  }
  return rows.sort((a, b) => b.percent - a.percent)
}

export type ZoneCollection = FeatureCollection<Polygon | MultiPolygon, ZoneProps>
