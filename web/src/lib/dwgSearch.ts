import type { CadViewer, DxfEntity } from '@cadview/core'
import { computeEntityBBox, fitToView as viewTransformForBounds } from '@cadview/core'

export type DwgSearchHit = {
  entityIndex: number
  title: string
  subtitle: string
}

function entityText(entity: DxfEntity): string | null {
  if (entity.type === 'TEXT') return entity.text
  if (entity.type === 'MTEXT') {
    return entity.text.replace(/\\[A-Za-z][^;]*;|{/g, ' ').replace(/\\P/g, ' ').replace(/}/g, ' ').trim()
  }
  return null
}

export function searchDwgEntities(entities: DxfEntity[], query: string, limit = 40): DwgSearchHit[] {
  const q = query.trim().toLowerCase()
  if (!q) return []

  const hits: DwgSearchHit[] = []
  for (let entityIndex = 0; entityIndex < entities.length; entityIndex++) {
    const entity = entities[entityIndex]
    const text = entityText(entity)
    const layerMatch = entity.layer.toLowerCase().includes(q)
    const typeMatch = entity.type.toLowerCase().includes(q)
    const textMatch = text?.toLowerCase().includes(q)

    if (!layerMatch && !typeMatch && !textMatch) continue

    const title = textMatch && text ? text.slice(0, 80) : `${entity.type} · ${entity.layer}`
    const parts = [entity.type, entity.layer]
    if (text && !textMatch) parts.push(text.slice(0, 40))
    hits.push({ entityIndex, title, subtitle: parts.join(' · ') })

    if (hits.length >= limit) break
  }
  return hits
}

export function focusDwgEntity(viewer: CadViewer, canvas: HTMLCanvasElement, entity: DxfEntity) {
  const bbox = computeEntityBBox(entity)
  const rect = canvas.getBoundingClientRect()

  if (!bbox || rect.width <= 0 || rect.height <= 0) {
    if (entity.type === 'TEXT' || entity.type === 'MTEXT') {
      viewer.panTo(entity.insertionPoint.x, entity.insertionPoint.y)
    }
    return
  }

  const cx = (bbox.minX + bbox.maxX) / 2
  const cy = (bbox.minY + bbox.maxY) / 2
  const vt = viewTransformForBounds(rect.width, rect.height, bbox.minX, bbox.minY, bbox.maxX, bbox.maxY, 0.15)
  viewer.zoomTo(vt.scale)
  viewer.panTo(cx, cy)
}

export function describeDwgEntity(entity: DxfEntity): { headline: string; lines: string[] } {
  const text = entityText(entity)
  const headline = text ? text.slice(0, 120) : `${entity.type}`
  const lines = [`Lớp: ${entity.layer}`, `Loại: ${entity.type}`]
  if (text && headline !== text) lines.push(`Nội dung: ${text.slice(0, 200)}`)
  return { headline, lines }
}