import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { LogOut, Settings as Gear } from 'lucide-react'
import { useAuth } from '../lib/AuthContext'
import { Avatar } from './ui'

export function Logo({ light = true }) {
  return (
    <div className="side-logo">
      <span className="logo-dot" />
      <span>CyberHelpDesk</span>
    </div>
  )
}

function Sidebar({ items, admin }) {
  const { signOut } = useAuth()
  const nav = useNavigate()
  return (
    <aside className="side">
      <Logo />
      {admin && <span className="side-badge">ADMIN CONSOLE</span>}
      <nav className="nav" aria-label="Main">
        {items.map((i) => (
          <NavLink key={i.to} to={i.to} end={i.end} className={({ isActive }) => (isActive ? 'active' : '')}>
            <i />
            {i.label}
          </NavLink>
        ))}
      </nav>
      <div className="side-foot">
        <NavLink to={admin ? '/admin/settings' : '/settings'} className={({ isActive }) => `foot-link ${isActive ? 'active' : ''}`}>
          <Gear size={15} /> Settings
        </NavLink>
        <button className="foot-link" onClick={async () => { await signOut(); nav('/login') }}>
          <LogOut size={15} /> Log Out
        </button>
      </div>
    </aside>
  )
}

export function Topbar({ title, children, left }) {
  const { profile, signOut } = useAuth()
  const nav = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const admin = profile?.role === 'admin'

  useEffect(() => {
    const close = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  return (
    <header className="topbar">
      <div className="row gap12 topbar-left">
        {left}
        {title && <h1>{title}</h1>}
      </div>
      <div className="row gap12" ref={ref}>
        {children}
        <button className="avatar-btn" onClick={() => setOpen(!open)} aria-label="Account menu" aria-expanded={open}>
          <Avatar name={profile?.full_name} src={profile?.avatar_url} size={36} tone={admin ? 'dark' : 'blue'} />
        </button>
        {open && (
          <div className="menu">
            <div className="menu-head">
              <b>{profile?.full_name || 'Account'}</b>
              <span>{profile?.email}</span>
            </div>
            <button onClick={() => { setOpen(false); nav(admin ? '/admin/settings' : '/settings') }}>Settings</button>
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
  return (
    <div className="shell">
      <Sidebar items={items} />
      <main className="main"><Outlet /></main>
    </div>
  )
}

export function AdminLayout() {
  const items = [
    { to: '/admin', label: 'Dashboard', end: true },
    { to: '/admin/queue', label: 'Ticket Queue' },
    { to: '/admin/verifications', label: 'Transaction Verifications' },
    { to: '/admin/reports', label: 'Reports & Analytics' },
  ]
  return (
    <div className="shell">
      <Sidebar items={items} admin />
      <main className="main"><Outlet /></main>
    </div>
  )
}
