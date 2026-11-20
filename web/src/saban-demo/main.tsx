import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './saban-demo.css'
import SabanDemoApp from './SabanDemoApp'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SabanDemoApp />
  </StrictMode>,
)
