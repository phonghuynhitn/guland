import { useSyncExternalStore } from 'react'

export type AppRoute = 'map' | 'dwg' | 'tdl-scale-model'

function readRoute(): AppRoute {
  const path = window.location.pathname.replace(/\/$/, '') || '/'
  if (path === '/tdl-scale-model') {
    return 'tdl-scale-model'
  }
  if (path === '/dwg' || path.startsWith('/dwg/')) {
    return 'dwg'
  }

  const hash = window.location.hash.replace(/^#\/?/, '')
  if (hash === 'dwg' || hash.startsWith('dwg/') || hash.startsWith('dwg?')) {
    return 'dwg'
  }
  return 'map'
}

export function useAppRoute(): AppRoute {
  return useSyncExternalStore(
    (onStoreChange) => {
      window.addEventListener('hashchange', onStoreChange)
      window.addEventListener('popstate', onStoreChange)
      return () => {
        window.removeEventListener('hashchange', onStoreChange)
        window.removeEventListener('popstate', onStoreChange)
      }
    },
    readRoute,
    () => 'map',
  )
}

export function hrefDwg(): string {
  return '/dwg'
}

export function hrefCadViewer(): string {
  return '/cad-viewer/'
}

export function hrefMap(): string {
  return '/'
}

export function hrefTdlScaleModel(): string {
  return '/tdl-scale-model'
}