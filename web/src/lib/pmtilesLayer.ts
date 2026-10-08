import L from 'leaflet'
import { PMTiles, TileType } from 'pmtiles'

const MIME_TYPES: Partial<Record<TileType, string>> = {
  [TileType.Png]: 'image/png',
  [TileType.Jpeg]: 'image/jpeg',
  [TileType.Webp]: 'image/webp',
  [TileType.Avif]: 'image/avif',
}

const archives = new Map<string, PMTiles>()

export function getArchive(url: string): PMTiles {
  let archive = archives.get(url)
  if (!archive) {
    archive = new PMTiles(url)
    archives.set(url, archive)
  }
  return archive
}

export async function getTileBlob(archive: PMTiles, z: number, x: number, y: number, signal?: AbortSignal) {
  const header = await archive.getHeader()
  const type = MIME_TYPES[header.tileType]
  if (!type) throw new Error(`PMTiles archive is not a raster archive (tileType=${header.tileType})`)
  const tile = await archive.getZxy(z, x, y, signal)
  return tile ? new Blob([tile.data], { type }) : null
}

export class PmtilesRasterLayer extends L.GridLayer {
  private archive: PMTiles
  private controllers = new WeakMap<HTMLElement, AbortController>()

  constructor(url: string, options?: L.GridLayerOptions) {
    super(options)
    this.archive = getArchive(url)
    this.on('tileunload', (e: L.TileEvent) => this.controllers.get(e.tile)?.abort())
  }

  createTile(coords: L.Coords, done: L.DoneCallback): HTMLElement {
    const img = document.createElement('img')
    img.alt = ''
    const controller = new AbortController()
    this.controllers.set(img, controller)

    getTileBlob(this.archive, coords.z, coords.x, coords.y, controller.signal)
      .then((blob) => {
        if (!blob) {
          done(undefined, img)
          return
        }
        const src = URL.createObjectURL(blob)
        img.onload = () => {
          URL.revokeObjectURL(src)
          done(undefined, img)
        }
        img.onerror = () => {
          URL.revokeObjectURL(src)
          done(new Error('tile decode failed'), img)
        }
        img.src = src
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) done(err as Error, img)
      })

    return img
  }
}
