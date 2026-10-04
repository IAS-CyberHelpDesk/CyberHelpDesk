import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { Segmented, Field, errMsg } from '../components/ui'

export default function Login() {
  const { session, profile, signIn, signUp, resetPassword } = useAuth()
  const nav = useNavigate()
  const [role, setRole] = useState('user')
  const [mode, setMode] = useState('login') // login | signup
  const [f, setF] = useState({ email: '', password: '', fullName: '', businessName: '', remember: true })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [info, setInfo] = useState('')
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })

  useEffect(() => { setErr(''); setInfo('') }, [mode, role])

  if (!busy && session && profile) return <Navigate to={profile.role === 'admin' ? '/admin' : '/status'} replace />

  const submit = async (e) => {
    e.preventDefault()
    setErr(''); setInfo(''); setBusy(true)
    try {
      if (mode === 'signup') {
        if (f.password.length < 12) throw new Error('Use at least 12 characters for your password.')
        const res = await signUp(f)
        if (!res.session) {
          setInfo('Account created. Check your email to confirm it, then log in.')
          setMode('login')
        } else {
          nav('/status')
        }
      } else {
        const p = await signIn(f.email, f.password, f.remember, role)
        nav(p.role === 'admin' ? '/admin' : '/status')
      }
    } catch (e2) {
      setErr(errMsg(e2))
    } finally {
      setBusy(false)
    }
  }

  const forgot = async () => {
    if (!f.email) return setErr('Enter your email address first, then choose “Forgot password?”.')
    setErr('')
    try {
      await resetPassword(f.email)
      setInfo('If that email has an account, a reset link is on its way.')
    } catch (e2) { setErr(errMsg(e2)) }
  }

  return (
    <div className="login">
      <section className="login-brand">
        <div className="login-brand-inner">
          <div className="side-logo"><span className="logo-dot" /><span>CyberHelpDesk</span></div>
          <h1>Secure Help Desk for Small Enterprises</h1>
          <p>A centralized portal for reporting cybersecurity incidents, verifying suspicious transactions, and tracking resolution — built for SMEs without a dedicated IT security team.</p>
          <ul>
            <li>Report phishing, malware &amp; suspicious links</li>
            <li>Transaction verification middleman service</li>
            <li>Ticket tracking with priority &amp; status updates</li>
          </ul>
        </div>
      </section>

      <section className="login-form">
        <form className="login-card" onSubmit={submit}>
          {mode === 'login' && (
            <Segmented value={role} onChange={setRole} options={[{ value: 'user', label: 'Enterprise User' }, { value: 'admin', label: 'Administrator' }]} />
          )}
          <h2>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h2>
          <p className="muted">{mode === 'login' ? 'Log in to report incidents and verify transactions.' : 'Set up access for your business.'}</p>

          {mode === 'signup' && (
            <>
              <Field label="Full name"><input className="input" required value={f.fullName} onChange={set('fullName')} placeholder="Juan Dela Cruz" /></Field>
              <Field label="Business name"><input className="input" required value={f.businessName} onChange={set('businessName')} placeholder="Bright Bakery Co." /></Field>
            </>
          )}
          <Field label="Email address"><input className="input" type="email" required autoComplete="email" value={f.email} onChange={set('email')} placeholder="you@business.com" /></Field>
          <Field label="Password" hint={mode === 'signup' ? 'At least 12 characters with a mix of letters, numbers and symbols.' : undefined}>
            <input className="input" type="password" required autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={f.password} onChange={set('password')} placeholder="••••••••••" />
          </Field>

          {mode === 'login' && (
            <div className="row between">
              <label className="check"><input type="checkbox" checked={f.remember} onChange={set('remember')} /> Remember me</label>
              <button type="button" className="link" onClick={forgot}>Forgot password?</button>
            </div>
          )}

          {err && <div className="form-error" role="alert">{err}</div>}
          {info && <div className="form-info" role="status">{info}</div>}

          <button className="btn btn-primary block" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Log In' : 'Sign Up'}</button>

          {(mode === 'signup' || role === 'user') && (
            <p className="center muted small">
              {mode === 'login' ? 'Don’t have an account?' : 'Already have an account?'}{' '}
              <button type="button" className="link" onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}>{mode === 'login' ? 'Sign Up' : 'Log In'}</button>
            </p>
          )}
        </form>
      </section>
    </div>
  )
}
