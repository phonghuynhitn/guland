import type { FormatConverter } from '@cadview/core'
import { convertDwgToDxf, isDwg } from '@cadview/dwg'

const MB = 1024 * 1024

/** LibreDWG default is 30s — large DWG needs more time in the browser. */
export function dwgConversionTimeoutMs(byteLength: number): number {
  if (byteLength >= 10 * MB) return 5 * 60 * 1000
  if (byteLength >= 5 * MB) return 3 * 60 * 1000
  if (byteLength >= 1 * MB) return 90 * 1000
  return 30 * 1000
}

export const dwgConverterForViewer: FormatConverter = {
  detect: isDwg,
  convert: (buffer) =>
    convertDwgToDxf(buffer, {
      timeout: dwgConversionTimeoutMs(buffer.byteLength),
    }),
}

export function formatFileSize(bytes: number): string {
  if (bytes < MB) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / MB).toFixed(1)} MB`
}

export function isLargeCadFile(bytes: number): boolean {
  return bytes >= 5 * MB
}