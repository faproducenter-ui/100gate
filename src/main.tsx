import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import './index.css'
import App from './App.tsx'
import { STORY_RELEASE } from './episode/release'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={STORY_RELEASE ? '/story-preview' : '/'}>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
