import { lazy, Suspense } from 'react'
import MapApp from './pages/MapApp'
import DwgPage from './pages/DwgPage'
import { useAppRoute } from './lib/route'

const CadViewerPage = lazy(() => import('./pages/CadViewerPage'))

export default function App() {
  const route = useAppRoute()
  if (route === 'cad-viewer') {
    return (
      <Suspense fallback={<p className="cad-viewer-loading">Đang tải CAD Viewer…</p>}>
        <CadViewerPage />
      </Suspense>
    )
  }
  if (route === 'dwg') {
    return <DwgPage />
  }
  return <MapApp />
}