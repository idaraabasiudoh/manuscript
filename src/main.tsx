import { StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { UsernameSetup } from './components/AuthCard'
import { AuthProvider, useAuth } from './lib/auth'
import { isConfigured } from './lib/supabase'
import { AllProjectsPage } from './pages/AllProjects'
import { HomePage } from './pages/Home'
import { ProjectPage } from './pages/Project'
import { SettingsPage } from './pages/Settings'
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

/** Signed-in users pick a username before anything else. */
function UsernameGate({ children }: { children: ReactNode }) {
  const { session, profile } = useAuth()
  if (session && profile && !profile.username) return <UsernameSetup />
  return <>{children}</>
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isConfigured ? (
      <AuthProvider>
        <UsernameGate>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/projects" element={<AllProjectsPage />} />
              {/* One route for the project and a block opened full screen, so switching keeps state */}
              <Route path="/:id/:blockId?" element={<ProjectPage />} />
            </Routes>
          </BrowserRouter>
        </UsernameGate>
      </AuthProvider>
    ) : (
      <SetupNotice />
    )}
  </StrictMode>,
)
