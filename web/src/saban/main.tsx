import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './saban.css'
import SabanApp from './SabanApp'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SabanApp />
  </StrictMode>,
)
