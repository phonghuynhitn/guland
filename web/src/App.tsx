import MapApp from './pages/MapApp'
import DwgPage from './pages/DwgPage'
import { useAppRoute } from './lib/route'

export default function App() {
  const route = useAppRoute()
  if (route === 'dwg') {
    return <DwgPage />
  }
  return <MapApp />
}