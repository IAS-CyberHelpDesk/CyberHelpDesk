import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Search } from 'lucide-react'
import { Topbar } from '../../components/Layout'
import { useAuth } from '../../lib/AuthContext'
import { listMyItems } from '../../lib/api'
import { Badge, Empty, ErrorNote, PriorityBadge, Spinner, useAsync } from '../../components/ui'
import { fmtDate } from '../../lib/format'

export default function MyTickets() {
  const { profile } = useAuth()
  const [q, setQ] = useState('')
  const { data, loading, error, reload } = useAsync(() => listMyItems(profile.id), [profile.id])
  const rows = (data || []).filter((r) => `${r.code} ${r.type} ${r.statusLabel}`.toLowerCase().includes(q.toLowerCase()))

  return (
    <>
      <Topbar title="My Tickets" />
      <div className="content">
        <div className="card flush">
          <div className="card-head">
            <h2 className="h-md">My Tickets</h2>
            <label className="search">
              <Search size={15} />
              <input placeholder="Search tickets…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search tickets" />
            </label>
          </div>
          {loading && !data ? <Spinner /> : error ? <div className="pad"><ErrorNote error={error} onRetry={reload} /></div> : rows.length === 0 ? (
            <div className="pad"><Empty title={q ? 'No tickets match your search' : 'No tickets yet'}>{q ? 'Try a different word.' : <>Start with <Link className="link" to="/report">Report Incident</Link>.</>}</Empty></div>
          ) : (
            <div className="table-wrap">
              <table className="tbl">
                <thead><tr><th>ID</th><th>Type</th><th>Priority</th><th>Status</th><th>Last update</th><th /></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={`${r.kind}-${r.id}`}>
                      <td className="strong">{r.code}</td>
                      <td className="muted2">{r.type}</td>
                      <td><PriorityBadge value={r.priority} /></td>
                      <td><Badge kind={r.statusKey}>{r.statusLabel}</Badge></td>
                      <td>{fmtDate(r.date)}</td>
                      <td><Link className="link" to={`/tickets/${r.kind}/${r.id}`}>View →</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
