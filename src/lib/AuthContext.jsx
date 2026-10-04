import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { supabase, REMEMBER_KEY } from './supabase'

const AuthCtx = createContext(null)
export const useAuth = () => useContext(AuthCtx)

const EMAIL_KEY = 'chd_email'
const ROLE_KEY = 'chd_role'
const store = {
  get: (k) => { try { return localStorage.getItem(k) } catch { return null } },
  set: (k, v) => { try { localStorage.setItem(k, v) } catch { /* ignore */ } },
  del: (k) => { try { localStorage.removeItem(k) } catch { /* ignore */ } },
}

// Values used by the login form to pre-fill itself
export const getSavedLogin = () => ({
  email: store.get(EMAIL_KEY) || '',
  remember: store.get(REMEMBER_KEY) !== '0',
  role: store.get(ROLE_KEY) === 'admin' ? 'admin' : 'user',
})

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
      const s = data.session
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
    // Must be saved first: supabase.js reads it to pick localStorage vs sessionStorage.
    store.set(REMEMBER_KEY, remember ? '1' : '0')
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
    if (remember) store.set(EMAIL_KEY, email)
    else store.del(EMAIL_KEY)
    store.set(ROLE_KEY, expectedRole)
    return p
  }

  const signUp = async ({ email, password, fullName, businessName }) => {
    store.set(REMEMBER_KEY, '1')
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
