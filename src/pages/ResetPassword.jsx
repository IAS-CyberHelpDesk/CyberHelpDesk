import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { Field, Spinner, errMsg } from '../components/ui'

// Landing page for the link in the "reset your password" email.
export default function ResetPassword() {
  const { session, loading, finishRecovery } = useAuth()
  const nav = useNavigate()
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState(false)

  if (loading) return <div className="fullpage"><Spinner /></div>

  const submit = async (e) => {
    e.preventDefault()
    setErr('')
    if (pw.length < 12) return setErr('Use at least 12 characters for your password.')
    setBusy(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: pw })
      if (error) throw error
      setDone(true)
      finishRecovery()
      setTimeout(() => nav('/', { replace: true }), 1200)
    } catch (e2) {
      setErr(errMsg(e2))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fullpage">
      <form className="login-card" onSubmit={submit}>
        <h2>Choose a new password</h2>
        {!session ? (
          <>
            <p className="muted">This reset link has expired or was already used. Request a new one from the login screen.</p>
            <button type="button" className="btn btn-primary block" onClick={() => nav('/login')}>Back to log in</button>
          </>
        ) : done ? (
          <div className="form-info" role="status">Password updated. Taking you in…</div>
        ) : (
          <>
            <Field label="New password" hint="At least 12 characters with a mix of letters, numbers and symbols.">
              <input className="input" type="password" required autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
            </Field>
            {err && <div className="form-error" role="alert">{err}</div>}
            <button className="btn btn-primary block" disabled={busy}>{busy ? 'Please wait…' : 'Update password'}</button>
          </>
        )}
      </form>
    </div>
  )
}
