import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { EditorApp } from '@haku/editor'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <EditorApp />
  </StrictMode>,
)
