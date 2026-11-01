import { useState, type FormEvent } from 'react'
import { setUsername, signIn, signUp } from '../lib/supabase'
import { useAuth } from '../lib/auth'

/** Email + password sign in / sign up, in one card. */
export function AuthCard({ title, subtitle, initialMode = 'signin' }: { title?: string; subtitle?: string; initialMode?: 'signin' | 'signup' }) {
  const [mode, setMode] = useState<'signin' | 'signup'>(initialMode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      if (mode === 'signup') await signUp(email, password)
      else await signIn(email, password)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  return (
    <form className="auth-card" onSubmit={submit}>
      <div className="auth-head">
        <h2>{title ?? (mode === 'signin' ? 'Sign in' : 'Create your account')}</h2>
        <p className="muted">{subtitle ?? (mode === 'signin' ? 'Welcome back. Pick up where you left off.' : 'All you need is an email and a password.')}</p>
      </div>
      <div className="auth-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={mode === 'signin'} className={mode === 'signin' ? 'on' : ''} onClick={() => (setMode('signin'), setError(''))}>
          Sign in
        </button>
        <button type="button" role="tab" aria-selected={mode === 'signup'} className={mode === 'signup' ? 'on' : ''} onClick={() => (setMode('signup'), setError(''))}>
          Sign up
        </button>
      </div>
      <label className="field">
        <span className="field-label">Email</span>
        <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
      </label>
      <label className="field">
        <span className="field-label">Password</span>
        <input
          type="password"
          autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={mode === 'signup' ? 'At least 8 characters' : 'Your password'}
          minLength={mode === 'signup' ? 8 : undefined}
          required
        />
      </label>
      {error && <p className="hint error">{error}</p>}
      <button className="btn primary lg auth-submit" disabled={busy || !email || !password}>
        {busy ? (mode === 'signin' ? 'Signing in…' : 'Creating account…') : mode === 'signin' ? 'Sign in' : 'Create account'}
      </button>
    </form>
  )
}

/** Shown once, right after sign-up: everyone picks a username (changeable later in Settings). */
export function UsernameSetup() {
  const { profile, refreshProfile } = useAuth()
  const [name, setName] = useState(() => (profile?.email ?? '').split('@')[0].toLowerCase().replace(/[^a-z0-9_.-]/g, '').slice(0, 24))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await setUsername(name)
      await refreshProfile()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  return (
    <div className="full-message">
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-head">
          <h2>Choose a username</h2>
          <p className="muted">This is how people find you when sharing. You can change it any time in Settings.</p>
        </div>
        <label className="field">
          <span className="field-label">Username</span>
          <div className="username-input">
            <span>@</span>
            <input value={name} onChange={(e) => setName(e.target.value.toLowerCase().replace(/\s+/g, ''))} autoFocus autoCapitalize="off" autoCorrect="off" spellCheck={false} maxLength={24} />
          </div>
          <span className="hint">3–24 characters: letters, numbers, dots, dashes and underscores</span>
        </label>
        {error && <p className="hint error">{error}</p>}
        <button className="btn primary lg auth-submit" disabled={busy || name.length < 3}>
          {busy ? 'Saving…' : 'Continue'}
        </button>
      </form>
    </div>
  )
}
