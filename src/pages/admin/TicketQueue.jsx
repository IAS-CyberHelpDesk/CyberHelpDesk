import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search } from 'lucide-react'
import { Topbar } from '../../components/Layout'
import { bulkAssign, listAdmins, listQueue } from '../../lib/api'
import { Avatar, Badge, Empty, ErrorNote, Modal, PriorityBadge, Spinner, errMsg, useAsync, useToast } from '../../components/ui'
import { fmtDate } from '../../lib/format'

export default function TicketQueue({ onlyTxn = false }) {
  const nav = useNavigate()
  const toast = useToast()
  const { data, loading, error, reload } = useAsync(listQueue, [])
  const [status, setStatus] = useState('all')
  const [priority, setPriority] = useState('all')
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(new Set())
  const [assignOpen, setAssignOpen] = useState(false)
  const [admins, setAdmins] = useState([])
  const [busy, setBusy] = useState(false)

  const base = useMemo(() => (data || []).filter((r) => (onlyTxn ? r.kind === 'txn' : true)), [data, onlyTxn])
  const statuses = useMemo(() => [...new Map(base.map((r) => [r.statusKey, r.statusLabel])).entries()], [base])
  const rows = base.filter((r) =>
    (status === 'all' || r.statusKey === status) &&
    (priority === 'all' || r.priority === priority) &&
    `${r.code} ${r.who} ${r.type} ${r.assignee || ''}`.toLowerCase().includes(q.toLowerCase()))
  const key = (r) => `${r.kind}:${r.id}`
  const allOn = rows.length > 0 && rows.every((r) => sel.has(key(r)))

  const toggleAll = () => setSel(allOn ? new Set() : new Set(rows.map(key)))
  const toggle = (r) => { const n = new Set(sel); n.has(key(r)) ? n.delete(key(r)) : n.add(key(r)); setSel(n) }
  const openAssign = async () => {
    try { setAdmins(await listAdmins()); setAssignOpen(true) } catch (e) { toast(errMsg(e), 'err') }
  }
  const assign = async (adminId) => {
    setBusy(true)
    try {
      await bulkAssign(rows.filter((r) => sel.has(key(r))), adminId)
      toast(`Assigned ${sel.size} item${sel.size > 1 ? 's' : ''}.`)
      setSel(new Set()); setAssignOpen(false); reload()
    } catch (e) { toast(errMsg(e), 'err') } finally { setBusy(false) }
  }

  return (
    <>
      <Topbar title={onlyTxn ? 'Transaction Verifications' : 'Ticket Queue'} />
      <div className="content">
        <div className="card flush">
          <div className="card-head wrap gap12">
            <h2 className="h-md">{onlyTxn ? 'Verification Requests' : 'Ticket Queue'}</h2>
            <div className="row gap8 wrap">
              <label className="search"><Search size={15} /><input placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" /></label>
              <select className="select compact" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
                <option value="all">Status: All</option>
                {statuses.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
              <select className="select compact" value={priority} onChange={(e) => setPriority(e.target.value)} aria-label="Filter by priority">
                <option value="all">Priority: All</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
              </select>
              <button className="btn btn-primary sm" disabled={!sel.size} onClick={openAssign}><Plus size={14} /> Assign Bulk{sel.size ? ` (${sel.size})` : ''}</button>
            </div>
          </div>
          {loading && !data ? <Spinner /> : error ? <div className="pad"><ErrorNote error={error} onRetry={reload} /></div> : rows.length === 0 ? (
            <div className="pad"><Empty title="Nothing matches">Try clearing a filter.</Empty></div>
          ) : (
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th className="narrow"><input type="checkbox" checked={allOn} onChange={toggleAll} aria-label="Select all" /></th>
                    <th>ID</th><th>Reporter / Enterprise</th><th>Type</th><th>Priority</th><th>Status</th><th>Assigned To</th><th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={key(r)} className="clickable" onClick={() => nav(r.kind === 'ticket' ? `/admin/tickets/${r.id}` : `/admin/verifications/${r.id}`)}>
                      <td className="narrow" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={sel.has(key(r))} onChange={() => toggle(r)} aria-label={`Select ${r.code}`} /></td>
                      <td className="strong">{r.code}</td><td>{r.who}</td><td className="muted2">{r.type}</td>
                      <td><PriorityBadge value={r.priority} /></td>
                      <td><Badge kind={r.statusKey}>{r.statusLabel}</Badge></td>
                      <td>{r.assignee || <span className="muted">Unassigned</span>}</td>
                      <td className="muted2">{fmtDate(r.date)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {assignOpen && (
        <Modal title={`Assign ${sel.size} item${sel.size > 1 ? 's' : ''}`} onClose={() => setAssignOpen(false)}>
          <div className="stack gap8">
            {admins.map((a) => (
              <button key={a.id} className="pick-row" disabled={busy} onClick={() => assign(a.id)}>
                <Avatar name={a.full_name} src={a.avatar_url} size={32} /><span><b>{a.full_name}</b><em>{a.admin_title || 'Admin'}</em></span>
              </button>
            ))}
          </div>
        </Modal>
      )}
    </>
  )
}
