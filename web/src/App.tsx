import MapApp from './pages/MapApp'
import DwgPage from './pages/DwgPage'
import TdlScaleModelPage from './pages/TdlScaleModelPage'
import { useAppRoute } from './lib/route'

export default function App() {
  const route = useAppRoute()
  if (route === 'dwg') {
    return <DwgPage />
  }
  if (route === 'tdl-scale-model') {
    return <TdlScaleModelPage />
  }
  return <MapApp />
}