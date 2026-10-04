import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { configured } from './lib/supabase'
import { useAuth } from './lib/AuthContext'
import { Spinner } from './components/ui'
import { AdminLayout, UserLayout } from './components/Layout'

import Login from './pages/Login'
import ResetPassword from './pages/ResetPassword'
import Status from './pages/user/Status'
import ReportIncident from './pages/user/ReportIncident'
import VerifyTransaction from './pages/user/VerifyTransaction'
import MyTickets from './pages/user/MyTickets'
import UserItemDetail from './pages/user/UserItemDetail'
import Feedback from './pages/user/Feedback'
import UserSettings from './pages/user/UserSettings'

import Dashboard from './pages/admin/Dashboard'
import TicketQueue from './pages/admin/TicketQueue'
import AdminTicketDetail from './pages/admin/AdminTicketDetail'
import AdminTransactionDetail from './pages/admin/AdminTransactionDetail'
import Reports from './pages/admin/Reports'
import AdminSettings from './pages/admin/AdminSettings'

const home = (role) => (role === 'admin' ? '/admin' : '/status')

function RequireRole({ role }) {
  const { session, profile, loading, recovering } = useAuth()
  if (loading || (session && !profile)) return <div className="fullpage"><Spinner /></div>
  if (recovering) return <Navigate to="/reset-password" replace />
  if (!session) return <Navigate to="/login" replace />
  if (profile.role !== role) return <Navigate to={home(profile.role)} replace />
  return <Outlet />
}

function Root() {
  const { session, profile, loading } = useAuth()
  if (loading || (session && !profile)) return <div className="fullpage"><Spinner /></div>
  return <Navigate to={session ? home(profile.role) : '/login'} replace />
}

function SetupNotice() {
  return (
    <div className="fullpage">
      <div className="card setup">
        <h2>Connect your Supabase project</h2>
        <p>Copy <code>.env.example</code> to <code>.env</code>, fill in your project URL and anon key, then restart <code>npm run dev</code>.</p>
        <p className="muted">The step-by-step guide is in README.md.</p>
      </div>
    </div>
  )
}

export default function App() {
  if (!configured) return <SetupNotice />
  return (
    <Routes>
      <Route path="/" element={<Root />} />
      <Route path="/login" element={<Login />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      <Route element={<RequireRole role="user" />}>
        <Route element={<UserLayout />}>
          <Route path="/status" element={<Status />} />
          <Route path="/report" element={<ReportIncident />} />
          <Route path="/verify" element={<VerifyTransaction />} />
          <Route path="/tickets" element={<MyTickets />} />
          <Route path="/tickets/:kind/:id" element={<UserItemDetail />} />
          <Route path="/feedback" element={<Feedback />} />
          <Route path="/settings" element={<UserSettings />} />
        </Route>
      </Route>

      <Route element={<RequireRole role="admin" />}>
        <Route element={<AdminLayout />}>
          <Route path="/admin" element={<Dashboard />} />
          <Route path="/admin/queue" element={<TicketQueue />} />
          <Route path="/admin/verifications" element={<TicketQueue onlyTxn />} />
          <Route path="/admin/tickets/:id" element={<AdminTicketDetail />} />
          <Route path="/admin/verifications/:id" element={<AdminTransactionDetail />} />
          <Route path="/admin/reports" element={<Reports />} />
          <Route path="/admin/settings" element={<AdminSettings />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
