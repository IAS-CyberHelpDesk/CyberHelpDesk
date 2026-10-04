import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { LogOut, Menu, Settings as Gear } from 'lucide-react'
import { useAuth } from '../lib/AuthContext'
import { LOGO_URL } from '../lib/constants'
import { Avatar } from './ui'

/* Circular logo. Put your image at public/logo.png — falls back to the cyan dot. */
export function Logo() {
  const [ok, setOk] = useState(Boolean(LOGO_URL))
  return (
    <div className="side-logo">
      {ok ? <img className="logo-img" src={LOGO_URL} alt="" onError={() => setOk(false)} /> : <span className="logo-dot" />}
      <span>CyberHelpDesk</span>
    </div>
  )
}

/* Lets <Topbar> (rendered inside pages) open the mobile drawer owned by the layout. */
const NavCtx = createContext({ open: false, setOpen: () => {} })

function Sidebar({ items, admin }) {
  const { signOut } = useAuth()
  const { open, setOpen } = useContext(NavCtx)
  const nav = useNavigate()
  const close = () => setOpen(false)
  return (
    <>
      <aside className={`side ${open ? 'open' : ''}`} aria-label="Sidebar">
        <Logo />
        {admin && <span className="side-badge">ADMIN CONSOLE</span>}
        <nav className="nav" aria-label="Main">
          {items.map((i) => (
            <NavLink key={i.to} to={i.to} end={i.end} onClick={close} className={({ isActive }) => (isActive ? 'active' : '')}>
              <i />
              {i.label}
            </NavLink>
          ))}
        </nav>
        <div className="side-foot">
          <NavLink to={admin ? '/admin/settings' : '/settings'} onClick={close} className={({ isActive }) => `foot-link ${isActive ? 'active' : ''}`}>
            <Gear size={15} /> Settings
          </NavLink>
          <button className="foot-link" onClick={async () => { close(); await signOut(); nav('/login') }}>
            <LogOut size={15} /> Log Out
          </button>
        </div>
      </aside>
      <div className={`scrim ${open ? 'show' : ''}`} onClick={close} aria-hidden="true" />
    </>
  )
}

function Shell({ items, admin }) {
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()

  useEffect(() => setOpen(false), [pathname])
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open])

  return (
    <NavCtx.Provider value={{ open, setOpen }}>
      <div className="shell">
        <Sidebar items={items} admin={admin} />
        <main className="main"><Outlet /></main>
      </div>
    </NavCtx.Provider>
  )
}

export function Topbar({ title, children, left }) {
  const { profile, signOut } = useAuth()
  const { setOpen } = useContext(NavCtx)
  const nav = useNavigate()
  const [open, setMenu] = useState(false)
  const ref = useRef(null)
  const admin = profile?.role === 'admin'

  useEffect(() => {
    const close = (e) => ref.current && !ref.current.contains(e.target) && setMenu(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  return (
    <header className="topbar">
      <div className="topbar-left">
        <button className="icon-btn menu-btn" onClick={() => setOpen(true)} aria-label="Open menu"><Menu size={22} /></button>
        {left}
        {title && <h1>{title}</h1>}
      </div>
      <div className="topbar-right" ref={ref}>
        {children}
        <button className="avatar-btn" onClick={() => setMenu(!open)} aria-label="Account menu" aria-expanded={open}>
          <Avatar name={profile?.full_name} src={profile?.avatar_url} size={36} tone={admin ? 'dark' : 'blue'} />
        </button>
        {open && (
          <div className="menu">
            <div className="menu-head">
              <b>{profile?.full_name || 'Account'}</b>
              <span>{profile?.email}</span>
            </div>
            <button onClick={() => { setMenu(false); nav(admin ? '/admin/settings' : '/settings') }}>Settings</button>
            <button onClick={async () => { await signOut(); nav('/login') }}>Log out</button>
          </div>
        )}
      </div>
    </header>
  )
}

export function UserLayout() {
  const items = [
    { to: '/status', label: 'Status' },
    { to: '/report', label: 'Report Incident' },
    { to: '/verify', label: 'Verify Transaction' },
    { to: '/tickets', label: 'My Tickets' },
    { to: '/feedback', label: 'Feedback' },
  ]
  return <Shell items={items} />
}

export function AdminLayout() {
  const items = [
    { to: '/admin', label: 'Dashboard', end: true },
    { to: '/admin/queue', label: 'Ticket Queue' },
    { to: '/admin/verifications', label: 'Transaction Verifications' },
    { to: '/admin/reports', label: 'Reports & Analytics' },
  ]
  return <Shell items={items} admin />
}
