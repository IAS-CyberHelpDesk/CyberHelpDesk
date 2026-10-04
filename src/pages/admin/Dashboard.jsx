import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Topbar } from '../../components/Layout'
import { TypeChart, typeSeries } from '../../components/Charts'
import { getOverview, listQueue } from '../../lib/api'
import { Badge, ErrorNote, PriorityBadge, Spinner, useAsync } from '../../components/ui'
import { fmtDate } from '../../lib/format'

const RANGES = [
  { v: 30, l: 'This Month' }, { v: 7, l: 'Last 7 days' }, { v: 180, l: 'Last 6 months' }, { v: 365, l: 'Last 12 months' },
]
const pct = (a, b) => (b ? Math.round(((a - b) / b) * 100) : null)

function Kpi({ color, value, label, note, noteColor }) {
  return (
    <div className="card kpi">
      <i className="kpi-bar" style={{ background: color }} />
      <div className="num">{value}</div>
      <div className="muted">{label}</div>
      <div className="small" style={{ color: noteColor }}>{note}</div>
    </div>
  )
}

export default function Dashboard() {
  const nav = useNavigate()
  const [days, setDays] = useState(30)
  const ov = useAsync(() => getOverview(days), [days])
  const q = useAsync(() => listQueue(), [])
  const o = ov.data

  const totalDelta = o ? pct(o.total, o.total_prev) : null
  const resDelta = o && o.avg_resolution_days != null && o.avg_resolution_days_prev != null ? +(o.avg_resolution_days - o.avg_resolution_days_prev).toFixed(1) : null
  const prio = o?.priority || {}
  const prioTotal = (prio.high || 0) + (prio.medium || 0) + (prio.low || 0)

  return (
    <>
      <Topbar title="Admin Dashboard">
        <select className="select compact" value={days} onChange={(e) => setDays(+e.target.value)} aria-label="Time range">
          {RANGES.map((r) => <option key={r.v} value={r.v}>{r.l}</option>)}
        </select>
      </Topbar>
      <div className="content">
        {ov.error ? <ErrorNote error={ov.error} onRetry={ov.reload} /> : !o ? <Spinner /> : (
          <>
            <div className="grid g4">
              <Kpi color="#2563EB" value={o.total} label="Total Tickets" note={totalDelta == null ? 'No earlier period to compare' : `${totalDelta >= 0 ? '+' : ''}${totalDelta}% vs previous period`} noteColor="#2563EB" />
              <Kpi color="#F59E0B" value={o.open} label="Open / In Progress" note="Needs attention" noteColor="#D97706" />
              <Kpi color="#16A34A" value={o.avg_resolution_days != null ? `${o.avg_resolution_days} days` : '—'} label="Avg. Resolution Time" note={resDelta == null ? 'No earlier period to compare' : `${resDelta > 0 ? '+' : ''}${resDelta}d vs previous period`} noteColor="#16A34A" />
              <Kpi color="#7C3AED" value={o.avg_rating != null ? `${o.avg_rating} / 5` : '—'} label="User Satisfaction" note={`From ${o.rating_count} responses`} noteColor="#7C3AED" />
            </div>

            <div className="split wide mt24">
              <div className="card">
                <h2 className="h-md">Incidents by Type</h2>
                <TypeChart data={typeSeries(o)} />
              </div>
              <div className="card">
                <h2 className="h-md">Priority Breakdown</h2>
                {[['high', 'High', '#DC2626'], ['medium', 'Medium', '#F59E0B'], ['low', 'Low', '#16A34A']].map(([k, l, c]) => {
                  const share = prioTotal ? Math.round(((prio[k] || 0) / prioTotal) * 100) : 0
                  return (
                    <div key={k} className="meter">
                      <div className="row between"><span>{l}</span><b>{share}%</b></div>
                      <div className="bar"><i style={{ width: `${share}%`, background: c }} /></div>
                    </div>
                  )
                })}
              </div>
            </div>
          </>
        )}

        <div className="card flush mt24">
          <div className="card-head"><h2 className="h-md">Ticket Queue</h2><Link className="link" to="/admin/queue">View all</Link></div>
          {!q.data ? <Spinner /> : (
            <div className="table-wrap">
              <table className="tbl">
                <thead><tr><th>ID</th><th>Reporter / Enterprise</th><th>Type</th><th>Priority</th><th>Status</th><th>Assigned To</th><th>Date</th></tr></thead>
                <tbody>
                  {q.data.slice(0, 5).map((r) => (
                    <tr key={`${r.kind}${r.id}`} className="clickable" onClick={() => nav(r.kind === 'ticket' ? `/admin/tickets/${r.id}` : `/admin/verifications/${r.id}`)}>
                      <td className="strong">{r.code}</td><td>{r.who}</td><td className="muted2">{r.type}</td>
                      <td><PriorityBadge value={r.priority} /></td><td><Badge kind={r.statusKey}>{r.statusLabel}</Badge></td>
                      <td>{r.assignee || 'Unassigned'}</td><td className="muted2">{fmtDate(r.date)}</td>
                    </tr>
                  ))}
                  {!q.data.length && <tr><td colSpan="7" className="muted pad">No tickets yet.</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
