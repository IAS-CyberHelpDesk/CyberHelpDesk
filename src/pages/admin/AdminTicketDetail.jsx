import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, ArrowUp, Check, Lock, Paperclip, Send, Zap } from 'lucide-react'
import { Topbar } from '../../components/Layout'
import { useAuth } from '../../lib/AuthContext'
import { addMessage, getAdminTicket, listAdmins, openAttachment, updateTicket, uploadEvidence } from '../../lib/api'
import { Avatar, Badge, ErrorNote, FileTile, PriorityBadge, Spinner, errMsg, useAsync, useToast } from '../../components/ui'
import { CANNED_REPLIES, MAX_FILE_BYTES } from '../../lib/constants'
import { fmtDateTimeLong, fmtTime, remaining, slaProgress, ticketStatus } from '../../lib/format'

function useTick(ms = 30000) {
  const [, set] = useState(0)
  useEffect(() => { const t = setInterval(() => set((x) => x + 1), ms); return () => clearInterval(t) }, [ms])
}

export default function AdminTicketDetail() {
  const { id } = useParams()
  const { profile } = useAuth()
  const toast = useToast()
  const fileRef = useRef(null)
  const { data, error, reload } = useAsync(async () => {
    const [d, admins] = await Promise.all([getAdminTicket(id), listAdmins()])
    return { ...d, admins }
  }, [id])
  const [tab, setTab] = useState('conversation')
  const [body, setBody] = useState('')
  const [internal, setInternal] = useState(false)
  const [busy, setBusy] = useState(false)
  const [canned, setCanned] = useState(false)
  const [editing, setEditing] = useState(false)
  const [det, setDet] = useState({ sender_domain: '', category: '', affected_users: '' })
  useTick()

  useEffect(() => {
    if (data?.item) setDet({ sender_domain: data.item.sender_domain || '', category: data.item.category || '', affected_users: data.item.affected_users ?? '' })
  }, [data])

  const feed = useMemo(() => {
    if (!data) return []
    const m = data.messages.map((x) => ({ t: x.created_at, kind: 'msg', x }))
    const e = data.events.filter((x) => x.kind === 'status').map((x) => ({ t: x.created_at, kind: 'evt', x }))
    return [...m, ...e].sort((a, b) => new Date(a.t) - new Date(b.t))
  }, [data])

  if (error) return <><Topbar title="Ticket" /><div className="content"><ErrorNote error={error} onRetry={reload} /></div></>
  if (!data) return <><Topbar title="Ticket" /><div className="content"><Spinner /></div></>

  const { item: t, messages, events, files, requester, similar, admins } = data
  const st = ticketStatus(t.status)
  const sla = remaining(t.due_at)
  const prog = slaProgress(t.created_at, t.due_at)
  const slaState = t.status === 'resolved' ? { k: 'resolved', l: 'Closed' } : sla.overdue ? { k: 'flagged', l: 'Breached' } : prog > 0.8 ? { k: 'in_progress', l: 'At risk' } : { k: 'safe', l: 'On track' }
  const internalCount = messages.filter((m) => m.is_internal).length

  const run = async (fn, ok) => {
    setBusy(true)
    try { await fn(); if (ok) toast(ok); reload() } catch (e) { toast(errMsg(e), 'err') } finally { setBusy(false) }
  }
  const patch = (p, ok) => run(() => updateTicket(t.id, p), ok)
  const send = () => {
    if (!body.trim()) return
    run(async () => { await addMessage(profile.id, 'ticket', t.id, body, internal); setBody('') }, internal ? 'Note added.' : 'Reply sent.')
  }
  const attach = async (e) => {
    const list = Array.from(e.target.files || []); e.target.value = ''
    if (list.some((f) => f.size > MAX_FILE_BYTES)) return toast('Files must be under 10MB.', 'err')
    run(() => uploadEvidence(profile.id, list, { ticket_id: t.id }), 'File attached.')
  }
  const saveDetails = () => run(async () => {
    await updateTicket(t.id, { sender_domain: det.sender_domain.trim() || null, category: det.category.trim() || null, affected_users: det.affected_users === '' ? null : Number(det.affected_users) })
    setEditing(false)
  }, 'Details saved.')

  return (
    <>
      <Topbar left={<div className="row gap12"><Link to="/admin/queue" className="back"><ArrowLeft size={15} /> Ticket Queue</Link><span className="sep">/</span><b className="h-md">{t.code}</b><Badge kind={st.key}>{st.label}</Badge><PriorityBadge value={t.priority} />{t.escalated && <Badge kind="flagged">Escalated</Badge>}</div>} />
      <div className="content">
        <div className="split">
          <div className="stack gap24">
            <div className="card">
              <h2 className="h-lg">{t.subject}</h2>
              <p className="small muted">Reported via {t.source} · {fmtDateTimeLong(t.created_at)}</p>
              <dl className="kv grid4 mt16">
                <div><dt>Reported By</dt><dd>{t.reporter?.full_name}</dd></div>
                <div><dt>Enterprise</dt><dd>{t.reporter?.business_name || '—'}</dd></div>
                <div><dt>Incident Type</dt><dd>{t.type}</dd></div>
                <div><dt>Affected Users</dt><dd>{editing ? <input className="input sm" type="number" min="0" value={det.affected_users} onChange={(e) => setDet({ ...det, affected_users: e.target.value })} /> : t.affected_users != null ? `${t.affected_users} employee${t.affected_users === 1 ? '' : 's'}` : '—'}</dd></div>
                <div><dt>Sender Domain</dt><dd>{editing ? <input className="input sm" value={det.sender_domain} onChange={(e) => setDet({ ...det, sender_domain: e.target.value })} /> : t.sender_domain || '—'}</dd></div>
                <div><dt>Category</dt><dd>{editing ? <input className="input sm" value={det.category} onChange={(e) => setDet({ ...det, category: e.target.value })} /> : t.category || '—'}</dd></div>
                <div><dt>Last Updated</dt><dd>{fmtDateTimeLong(t.updated_at)}</dd></div>
                <div><dt>Ticket ID</dt><dd>{t.code}</dd></div>
              </dl>
              <div className="row gap8 mt8">
                {editing ? (<><button className="btn btn-primary sm" disabled={busy} onClick={saveDetails}>Save details</button><button className="btn btn-outline sm" onClick={() => setEditing(false)}>Cancel</button></>) : <button className="link small" onClick={() => setEditing(true)}>Edit details</button>}
              </div>
              <hr />
              <span className="label">Description</span>
              <p className="pre">{t.description}</p>
              {files.length > 0 && (<><span className="label mt16">Attached Evidence</span><div className="chips-row">{files.map((f) => <FileTile key={f.id} file={f} onOpen={(x) => openAttachment(x.file_path).catch((e) => toast(errMsg(e), 'err'))} />)}</div></>)}
            </div>

            <div className="card">
              <div className="tabs" role="tablist">
                <button role="tab" aria-selected={tab === 'conversation'} className={tab === 'conversation' ? 'on' : ''} onClick={() => setTab('conversation')}>Conversation</button>
                <button role="tab" aria-selected={tab === 'notes'} className={tab === 'notes' ? 'on' : ''} onClick={() => setTab('notes')}>Internal Notes {internalCount > 0 && <span className="count">{internalCount}</span>}</button>
                <button role="tab" aria-selected={tab === 'activity'} className={tab === 'activity' ? 'on' : ''} onClick={() => setTab('activity')}>Activity Log</button>
              </div>

              {tab === 'conversation' && (
                <div className="thread">
                  {feed.length === 0 && <p className="muted">No messages yet. Reply to the reporter below.</p>}
                  {feed.map((r) => r.kind === 'evt' ? (
                    <div className="divider-text" key={`e${r.x.id}`}>{r.x.message}{r.x.actor ? ` by ${r.x.actor.full_name}` : ''} · {fmtTime(r.x.created_at)}</div>
                  ) : r.x.is_internal ? (
                    <div className="note-box" key={r.x.id}>
                      <div className="small"><Lock size={12} /> <b>Internal note · {r.x.author?.full_name}</b> {fmtTime(r.x.created_at)} · only admins can see this</div>
                      <div>{r.x.body}</div>
                    </div>
                  ) : (
                    <div className="msg" key={r.x.id}>
                      <Avatar name={r.x.author?.full_name} src={r.x.author?.avatar_url} size={32} tone={r.x.author?.role === 'admin' ? 'blue' : 'gray'} />
                      <div>
                        <div className="msg-meta"><b>{r.x.author?.full_name}</b><Badge kind={r.x.author?.role === 'admin' ? 'new' : 'draft'}>{r.x.author?.role === 'admin' ? 'Admin' : 'Reporter'}</Badge><span>{fmtTime(r.x.created_at)}</span></div>
                        <div className={`bubble ${r.x.author?.role === 'admin' ? 'admin' : ''}`}>{r.x.body}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {tab === 'notes' && (
                <div className="thread">
                  {internalCount === 0 && <p className="muted">No internal notes yet.</p>}
                  {messages.filter((m) => m.is_internal).map((m) => (
                    <div className="note-box" key={m.id}><div className="small"><Lock size={12} /> <b>{m.author?.full_name}</b> {fmtDateTimeLong(m.created_at)}</div><div>{m.body}</div></div>
                  ))}
                </div>
              )}
              {tab === 'activity' && (
                <ul className="activity pad-t">
                  {events.map((e) => <li key={e.id}><i className="dot b" /><div><b>{e.message}</b><span>{e.actor?.full_name ? `${e.actor.full_name} · ` : ''}{fmtDateTimeLong(e.created_at)}</span></div></li>)}
                </ul>
              )}

              <div className="composer">
                <textarea className="textarea bare" rows={3} value={body} onChange={(e) => setBody(e.target.value)} placeholder={internal ? 'Write an internal note (only admins can see this)…' : 'Write a reply to the reporter…'} />
                <div className="composer-bar">
                  <div className="row gap12 wrap">
                    <div className="seg small">
                      <button type="button" className={!internal ? 'on' : ''} onClick={() => setInternal(false)}>Reply to reporter</button>
                      <button type="button" className={internal ? 'on' : ''} onClick={() => setInternal(true)}>Internal note</button>
                    </div>
                    <button className="link-btn" onClick={() => fileRef.current?.click()}><Paperclip size={14} /> Attach</button>
                    <input ref={fileRef} type="file" multiple hidden accept=".png,.jpg,.jpeg,.pdf,.txt,.eml" onChange={attach} />
                    <div className="rel">
                      <button className="link-btn" onClick={() => setCanned(!canned)}><Zap size={14} /> Canned replies</button>
                      {canned && (
                        <div className="popover">
                          {CANNED_REPLIES.map((c) => <button key={c} onClick={() => { setBody(c); setCanned(false); setInternal(false) }}>{c}</button>)}
                        </div>
                      )}
                    </div>
                  </div>
                  <button className="btn btn-primary" disabled={busy || !body.trim()} onClick={send}>{internal ? 'Add note' : 'Send reply'} <Send size={14} /></button>
                </div>
              </div>
            </div>
          </div>

          <aside className="stack gap24">
            <div className="card stack gap12">
              <h2 className="h-md">Ticket Actions</h2>
              <label className="field"><span className="label">Status</span>
                <select className="select" value={t.status} disabled={busy} onChange={(e) => patch({ status: e.target.value }, 'Status updated.')}>
                  <option value="new">New</option><option value="in_progress">In Progress</option><option value="resolved">Resolved</option>
                </select></label>
              <label className="field"><span className="label">Priority</span>
                <select className="select" value={t.priority} disabled={busy} onChange={(e) => patch({ priority: e.target.value }, 'Priority updated.')}>
                  <option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
                </select></label>
              <label className="field"><span className="label">Assigned To</span>
                <select className="select" value={t.assigned_to || ''} disabled={busy} onChange={(e) => patch({ assigned_to: e.target.value || null }, 'Assignee updated.')}>
                  <option value="">Unassigned</option>
                  {admins.map((a) => <option key={a.id} value={a.id}>{a.full_name}</option>)}
                </select></label>
              <button className="btn btn-green block" disabled={busy || t.status === 'resolved'} onClick={() => patch({ status: 'resolved' }, 'Ticket resolved.')}><Check size={15} /> Mark as Resolved</button>
              <button className="btn btn-danger-outline block" disabled={busy || t.escalated} onClick={() => patch({ escalated: true, priority: 'high' }, 'Escalated to Security Lead.')}><ArrowUp size={15} /> {t.escalated ? 'Escalated to Security Lead' : 'Escalate to Security Lead'}</button>
            </div>

            <div className="card">
              <div className="row between"><h2 className="h-md">SLA Timer</h2><Badge kind={slaState.k} dot>{slaState.l}</Badge></div>
              {t.status === 'resolved' ? <div className="num-lg">Resolved</div> : <div className="num-lg">{sla.label} <span>{sla.overdue ? 'overdue' : 'remaining'}</span></div>}
              <div className="bar"><i style={{ width: `${Math.round(prog * 100)}%`, background: sla.overdue ? '#DC2626' : '#F59E0B' }} /></div>
              <div className="row between small mt8">
                <span style={{ color: '#15803D' }}>{t.first_response_at ? `First response met · ${Math.max(1, Math.round((new Date(t.first_response_at) - new Date(t.created_at)) / 60000))} min` : 'No response sent yet'}</span>
                <span className="muted">Due {fmtDateTimeLong(t.due_at)}</span>
              </div>
            </div>

            <div className="card">
              <h2 className="h-md">Requester</h2>
              <div className="row gap12 mt8"><Avatar name={t.reporter?.full_name} src={t.reporter?.avatar_url} size={40} tone="gray" /><div><b>{t.reporter?.full_name}</b><div className="small muted">{t.reporter?.business_name}</div></div></div>
              <div className="mini-stats">
                <div><b>{requester.total}</b><span>Total tickets</span></div>
                <div><b>{requester.open}</b><span>Open</span></div>
                <div><b>{requester.avg}</b><span>Avg rating</span></div>
              </div>
            </div>

            <div className="card">
              <h2 className="h-md">Similar Incidents</h2>
              {similar.length === 0 && <p className="small muted">Nothing similar yet.</p>}
              <div className="stack gap8 mt8">
                {similar.map((s) => { const x = ticketStatus(s.status); return (
                  <Link key={s.id} className="sim" to={`/admin/tickets/${s.id}`}>
                    <div><b>{s.code}</b><span>{s.type} · {s.reporter?.business_name || s.reporter?.full_name}</span></div>
                    <Badge kind={x.key}>{x.label}</Badge>
                  </Link>
                )})}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </>
  )
}
