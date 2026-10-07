import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Check, X } from 'lucide-react'
import { getSavedLogin, useAuth } from '../lib/AuthContext'
import { Segmented, Field, errMsg } from '../components/ui'
import { Logo } from '../components/Layout'

export default function Login() {
  const { session, profile, signIn, signUp, resetPassword } = useAuth()
  const nav = useNavigate()
  const saved = getSavedLogin()

  const [role, setRole] = useState(saved.role)
  const [mode, setMode] = useState('login')
  const [f, setF] = useState({
    email: saved.email,
    password: '',
    confirmPassword: '',
    fullName: '',
    businessName: '',
    remember: saved.remember,
  })

  const [showPw, setShowPw] = useState(false)
  const [showConfirmPw, setShowConfirmPw] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [info, setInfo] = useState('')

  const set = (k) => (e) =>
    setF({
      ...f,
      [k]: e.target.type === 'checkbox'
        ? e.target.checked
        : e.target.value,
    })

  useEffect(() => {
    setErr('')
    setInfo('')
    setShowPw(false)
    setShowConfirmPw(false)
  }, [mode, role])

  if (!busy && session && profile) {
    return (
      <Navigate
        to={profile.role === 'admin' ? '/admin' : '/status'}
        replace
      />
    )
  }

  const passwordChecks = {
    length: f.password.length >= 12,
    upper: /[A-Z]/.test(f.password),
    lower: /[a-z]/.test(f.password),
    number: /\d/.test(f.password),
    special: /[^A-Za-z0-9]/.test(f.password),
  }

  const passwordValid = Object.values(passwordChecks).every(Boolean)
  const passwordsMatch =
    f.password.length > 0 &&
    f.password === f.confirmPassword

  const submit = async (e) => {
    e.preventDefault()
    setErr('')
    setInfo('')

    const email = f.email.trim()

    if (!email) {
      setErr('Enter your email address.')
      return
    }

    if (!f.password) {
      setErr('Enter your password.')
      return
    }

    setBusy(true)

    try {
      if (mode === 'signup') {
        if (!f.fullName.trim()) {
          throw new Error('Enter your full name.')
        }

        if (!f.businessName.trim()) {
          throw new Error('Enter your business name.')
        }

        if (!passwordValid) {
          throw new Error(
            'Your password must meet all of the requirements below.'
          )
        }

        if (!passwordsMatch) {
          throw new Error('Your passwords do not match.')
        }

        const res = await signUp({
          ...f,
          email,
          fullName: f.fullName.trim(),
          businessName: f.businessName.trim(),
        })

        if (!res.session) {
          setInfo(
            'Account created successfully. Check your email to confirm your account, then log in.'
          )

          setF((x) => ({
            ...x,
            password: '',
            confirmPassword: '',
          }))

          setMode('login')
        } else {
          nav('/status')
        }
      } else {
        const p = await signIn(
          email,
          f.password,
          f.remember,
          role
        )

        nav(p.role === 'admin' ? '/admin' : '/status')
      }
    } catch (e2) {
      setErr(errMsg(e2))
    } finally {
      setBusy(false)
    }
  }

  const forgot = async () => {
    const email = f.email.trim()

    if (!email) {
      setErr(
        'Enter your email address first, then choose “Forgot password?”.'
      )
      return
    }

    setErr('')
    setInfo('')

    try {
      await resetPassword(email)
      setInfo(
        'If that email has an account, a password reset link is on its way.'
      )
    } catch (e2) {
      setErr(errMsg(e2))
    }
  }

  const passwordRequirement = (valid, text) => (
    <div className={`password-rule ${valid ? 'valid' : 'invalid'}`}>
      {valid ? <Check size={14} /> : <X size={14} />}
      <span>{text}</span>
    </div>
  )

  return (
    <div className="login">
      <section className="login-brand">
        <div className="login-brand-inner">
          <Logo />

          <h1>Secure Help Desk for Small Enterprises</h1>

          <p>
            A centralized portal for reporting cybersecurity incidents,
            verifying suspicious transactions, and tracking resolution —
            built for SMEs without a dedicated IT security team.
          </p>

          <ul>
            <li>Report phishing, malware &amp; suspicious links</li>
            <li>Transaction verification middleman service</li>
            <li>Ticket tracking with priority &amp; status updates</li>
          </ul>
        </div>
      </section>

      <section className="login-form">
        <form className="login-card" onSubmit={submit} noValidate>
          {mode === 'login' && (
            <Segmented
              value={role}
              onChange={setRole}
              options={[
                {
                  value: 'user',
                  label: 'Enterprise User',
                },
                {
                  value: 'admin',
                  label: 'Administrator',
                },
              ]}
            />
          )}

          <h2>
            {mode === 'login'
              ? 'Welcome back'
              : 'Create your account'}
          </h2>

          <p className="muted">
            {mode === 'login'
              ? 'Log in to report incidents and verify transactions.'
              : 'Set up access for your business.'}
          </p>

          {mode === 'signup' && (
            <>
              <Field label="Full name">
                <input
                  className="input"
                  required
                  autoComplete="name"
                  value={f.fullName}
                  onChange={set('fullName')}
                  placeholder="Juan Dela Cruz"
                  disabled={busy}
                />
              </Field>

              <Field label="Business name">
                <input
                  className="input"
                  required
                  autoComplete="organization"
                  value={f.businessName}
                  onChange={set('businessName')}
                  placeholder="Bright Bakery Co."
                  disabled={busy}
                />
              </Field>
            </>
          )}

          <Field label="Email address">
            <input
              className="input"
              type="email"
              required
              autoComplete="email"
              value={f.email}
              onChange={set('email')}
              placeholder="you@business.com"
              disabled={busy}
            />
          </Field>

          <Field
            label="Password"
            hint={
              mode === 'login'
                ? undefined
                : 'Create a strong password to protect your account.'
            }
          >
            <span className="pw-wrap">
              <input
                className="input"
                type={showPw ? 'text' : 'password'}
                required
                autoComplete={
                  mode === 'login'
                    ? 'current-password'
                    : 'new-password'
                }
                value={f.password}
                onChange={set('password')}
                placeholder="••••••••••"
                disabled={busy}
              />

              <button
                type="button"
                className="pw-toggle"
                onClick={() => setShowPw(!showPw)}
                aria-label={
                  showPw
                    ? 'Hide password'
                    : 'Show password'
                }
                disabled={busy}
              >
                {showPw ? (
                  <EyeOff size={17} />
                ) : (
                  <Eye size={17} />
                )}
              </button>
            </span>
          </Field>

          {mode === 'signup' && (
            <div className="password-requirements">
              <div className="password-requirements-title">
                Password requirements
              </div>

              {passwordRequirement(
                passwordChecks.length,
                'At least 12 characters'
              )}

              {passwordRequirement(
                passwordChecks.upper,
                'At least one uppercase letter'
              )}

              {passwordRequirement(
                passwordChecks.lower,
                'At least one lowercase letter'
              )}

              {passwordRequirement(
                passwordChecks.number,
                'At least one number'
              )}

              {passwordRequirement(
                passwordChecks.special,
                'At least one special character'
              )}
            </div>
          )}

          {mode === 'signup' && (
            <Field
              label="Confirm password"
              hint={
                f.confirmPassword && !passwordsMatch
                  ? 'Passwords do not match.'
                  : undefined
              }
            >
              <span className="pw-wrap">
                <input
                  className="input"
                  type={showConfirmPw ? 'text' : 'password'}
                  required
                  autoComplete="new-password"
                  value={f.confirmPassword}
                  onChange={set('confirmPassword')}
                  placeholder="••••••••••"
                  disabled={busy}
                  aria-invalid={
                    f.confirmPassword.length > 0 &&
                    !passwordsMatch
                  }
                />

                <button
                  type="button"
                  className="pw-toggle"
                  onClick={() =>
                    setShowConfirmPw(!showConfirmPw)
                  }
                  aria-label={
                    showConfirmPw
                      ? 'Hide confirmation password'
                      : 'Show confirmation password'
                  }
                  disabled={busy}
                >
                  {showConfirmPw ? (
                    <EyeOff size={17} />
                  ) : (
                    <Eye size={17} />
                  )}
                </button>
              </span>
            </Field>
          )}

          {mode === 'login' && (
            <div className="row between wrap">
              <label className="check">
                <input
                  type="checkbox"
                  checked={f.remember}
                  onChange={set('remember')}
                  disabled={busy}
                />
                Remember me
              </label>

              <button
                type="button"
                className="link small"
                onClick={forgot}
                disabled={busy}
              >
                Forgot password?
              </button>
            </div>
          )}

          {err && (
            <div className="form-error" role="alert">
              {err}
            </div>
          )}

          {info && (
            <div className="form-info" role="status">
              {info}
            </div>
          )}

          <button
            className="btn btn-primary block"
            disabled={
              busy ||
              (mode === 'signup' &&
                (!passwordValid || !passwordsMatch))
            }
          >
            {busy
              ? 'Please wait…'
              : mode === 'login'
                ? 'Log In'
                : 'Create Account'}
          </button>

          {(mode === 'signup' || role === 'user') && (
            <p className="center muted small">
              {mode === 'login'
                ? 'Don’t have an account?'
                : 'Already have an account?'}{' '}

              <button
                type="button"
                className="link"
                onClick={() =>
                  setMode(
                    mode === 'login'
                      ? 'signup'
                      : 'login'
                  )
                }
                disabled={busy}
              >
                {mode === 'login'
                  ? 'Sign Up'
                  : 'Log In'}
              </button>
            </p>
          )}
        </form>
      </section>
    </div>
  )
}