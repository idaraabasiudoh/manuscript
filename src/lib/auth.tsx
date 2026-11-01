import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { getMyProfile, supabase, type Profile } from './supabase'

type AuthState = {
  /** False until the stored session (if any) has been read. */
  ready: boolean
  session: Session | null
  profile: Profile | null
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthState>({ ready: false, session: null, profile: null, refreshProfile: async () => {} })

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)

  const refreshProfile = useCallback(async () => {
    const { data } = await supabase.auth.getSession()
    setProfile(data.session ? await getMyProfile().catch(() => null) : null)
  }, [])

  useEffect(() => {
    let alive = true
    supabase.auth.getSession().then(async ({ data }) => {
      if (!alive) return
      setSession(data.session)
      setProfile(data.session ? await getMyProfile().catch(() => null) : null)
      setReady(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next)
      if (event === 'SIGNED_OUT') setProfile(null)
      if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        // Defer: supabase-js warns against awaiting other calls inside this callback.
        setTimeout(() => getMyProfile().then((p) => alive && setProfile(p)).catch(() => {}), 0)
      }
    })
    return () => {
      alive = false
      sub.subscription.unsubscribe()
    }
  }, [])

  return <AuthContext.Provider value={{ ready, session, profile, refreshProfile }}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
