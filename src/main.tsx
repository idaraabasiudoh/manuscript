import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { isConfigured } from './lib/supabase'
import { HomePage } from './pages/Home'
import { ProjectPage } from './pages/Project'
import './styles.css'

function SetupNotice() {
  return (
    <div className="full-message">
      <h2>Connect Supabase</h2>
      <p className="muted">
        Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to <code>.env.local</code>, then
        restart the dev server.
      </p>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isConfigured ? (
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HomePage />} />
          {/* One route for the project and a block opened full screen, so switching keeps state */}
          <Route path="/:id/:blockId?" element={<ProjectPage />} />
        </Routes>
      </BrowserRouter>
    ) : (
      <SetupNotice />
    )}
  </StrictMode>,
)
