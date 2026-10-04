import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { supabase } from './supabase'

const AuthCtx = createContext(null)
export const useAuth = () => useContext(AuthCtx)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [recovering, setRecovering] = useState(false)

  const loadProfile = useCallback(async (uid) => {
    const { data } = await supabase.from('profiles').select('*').eq('id', uid).single()
    setProfile(data || null)
    return data || null
  }, [])

  useEffect(() => {
    let alive = true
    supabase.auth.getSession().then(async ({ data }) => {
      let s = data.session
      // "Remember me" unchecked → drop the session when the browser was closed
      if (s && localStorage.getItem('chd_remember') === '0' && !sessionStorage.getItem('chd_active')) {
        await supabase.auth.signOut()
        s = null
      }
      if (!alive) return
      setSession(s)
      if (s) await loadProfile(s.user.id)
      if (alive) setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') setRecovering(true)
      setSession(s)
      if (s) setTimeout(() => loadProfile(s.user.id), 0)
      else setProfile(null)
    })
    return () => {
      alive = false
      sub.subscription.unsubscribe()
    }
  }, [loadProfile])

  const signIn = async (email, password, remember, expectedRole) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    const p = await loadProfile(data.user.id)
    if (p?.role !== expectedRole) {
      await supabase.auth.signOut()
      throw new Error(
        expectedRole === 'admin'
          ? 'This account is not an administrator. Use the Enterprise User tab instead.'
          : 'This is an administrator account. Use the Administrator tab instead.',
      )
    }
    localStorage.setItem('chd_remember', remember ? '1' : '0')
    sessionStorage.setItem('chd_active', '1')
    return p
  }

  const signUp = async ({ email, password, fullName, businessName }) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName, business_name: businessName } },
    })
    if (error) throw error
    return data // data.session is null when email confirmation is required
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    sessionStorage.removeItem('chd_active')
  }

  const resetPassword = async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + '/reset-password' })
    if (error) throw error
  }

  const finishRecovery = () => setRecovering(false)

  const refreshProfile = () => (session ? loadProfile(session.user.id) : null)

  return (
    <AuthCtx.Provider value={{ session, profile, loading, recovering, finishRecovery, signIn, signUp, signOut, resetPassword, refreshProfile }}>
      {children}
    </AuthCtx.Provider>
  )
}
