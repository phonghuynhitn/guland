import { useSyncExternalStore } from 'react'

export type AppRoute = 'map' | 'dwg'

function readRoute(): AppRoute {
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
      return () => window.removeEventListener('hashchange', onStoreChange)
    },
    readRoute,
    () => 'map',
  )
}

export function hrefDwg(): string {
  return '/dwg'
}

export function hrefMap(): string {
  return '#/'
}