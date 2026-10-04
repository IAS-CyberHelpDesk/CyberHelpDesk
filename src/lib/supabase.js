import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

export const configured = Boolean(url && key)

/*
  "Remember me" support.
  - Checked   → the session is kept in localStorage (survives closing the browser).
  - Unchecked → the session is kept in sessionStorage (gone when the tab/browser closes).
  The choice is saved under `chd_remember` BEFORE signing in (see AuthContext.signIn),
  so Supabase writes the token to the right place.
*/
export const REMEMBER_KEY = 'chd_remember'

const safe = (fn, fallback = null) => {
  try { return fn() } catch { return fallback }
}
const wantsPersistence = () => safe(() => localStorage.getItem(REMEMBER_KEY) !== '0', true)

const authStorage = {
  getItem: (k) => safe(() => localStorage.getItem(k) ?? sessionStorage.getItem(k)),
  setItem: (k, v) =>
    safe(() => {
      const keep = wantsPersistence() ? localStorage : sessionStorage
      const drop = keep === localStorage ? sessionStorage : localStorage
      drop.removeItem(k)
      keep.setItem(k, v)
    }),
  removeItem: (k) =>
    safe(() => {
      localStorage.removeItem(k)
      sessionStorage.removeItem(k)
    }),
}

export const supabase = createClient(url || 'http://localhost:54321', key || 'missing-key', {
  auth: { storage: authStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
})
