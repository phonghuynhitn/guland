import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import CadViewerPage from '../pages/CadViewerPage'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CadViewerPage />
  </StrictMode>,
)