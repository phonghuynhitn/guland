import { useEffect, useRef } from 'react'
import L from 'leaflet'
import '@geoman-io/leaflet-geoman-free'
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css'
import { useMap } from 'react-leaflet'
import type { Polygon } from 'geojson'

type Props = {
  onParcelChange: (geometry: Polygon | null) => void
  onDrawingChange: (drawing: boolean) => void
}

function geometryOf(layer: L.Polygon): Polygon | null {
  const geom = layer.toGeoJSON().geometry
  if (geom.type === 'Polygon') return geom
  if (geom.type === 'MultiPolygon' && geom.coordinates[0]) {
    return { type: 'Polygon', coordinates: geom.coordinates[0] }
  }
  return null
}

export default function DrawControl({ onParcelChange, onDrawingChange }: Props) {
  const map = useMap()
  const parcelRef = useRef<L.Polygon | null>(null)
  const onParcelChangeRef = useRef(onParcelChange)
  const onDrawingChangeRef = useRef(onDrawingChange)
  onParcelChangeRef.current = onParcelChange
  onDrawingChangeRef.current = onDrawingChange

  useEffect(() => {
    map.pm.addControls({
      position: 'topright',
      drawMarker: false,
      drawCircleMarker: false,
      drawPolyline: false,
      drawRectangle: false,
      drawCircle: false,
      drawText: false,
      cutPolygon: false,
      rotateMode: false,
      drawPolygon: true,
      editMode: true,
      dragMode: true,
      removalMode: true,
    })
    map.pm.setGlobalOptions({
      continueDrawing: false,
      hintlineStyle: { color: '#0f766e', dashArray: '6 4' },
      templineStyle: { color: '#0f766e' },
      pathOptions: { color: '#0f766e', fillColor: '#0f766e', fillOpacity: 0.22, weight: 3 },
    })

    const adopt = (layer: L.Polygon) => {
      if (parcelRef.current && parcelRef.current !== layer) {
        map.removeLayer(parcelRef.current)
      }
      parcelRef.current = layer
      layer.setStyle({ color: '#0f766e', fillColor: '#0f766e', fillOpacity: 0.22, weight: 3 })
      onParcelChangeRef.current(geometryOf(layer))
      layer.on('pm:edit', () => onParcelChangeRef.current(geometryOf(layer)))
      layer.on('pm:dragend', () => onParcelChangeRef.current(geometryOf(layer)))
    }

    const onCreate = (e: { shape: string; layer: L.Layer }) => {
      if (e.shape !== 'Polygon') return
      adopt(e.layer as L.Polygon)
    }
    const onRemove = (e: { layer: L.Layer }) => {
      if (e.layer === parcelRef.current) {
        parcelRef.current = null
        onParcelChangeRef.current(null)
      }
    }
    const onDrawStart = () => onDrawingChangeRef.current(true)
    const onDrawEnd = () => onDrawingChangeRef.current(false)

    map.on('pm:create', onCreate)
    map.on('pm:remove', onRemove)
    map.on('pm:drawstart', onDrawStart)
    map.on('pm:drawend', onDrawEnd)

    return () => {
      map.off('pm:create', onCreate)
      map.off('pm:remove', onRemove)
      map.off('pm:drawstart', onDrawStart)
      map.off('pm:drawend', onDrawEnd)
      map.pm.removeControls()
      if (parcelRef.current) {
        map.removeLayer(parcelRef.current)
        parcelRef.current = null
      }
    }
  }, [map])

  return null
}
