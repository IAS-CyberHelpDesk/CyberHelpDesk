import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { ArrowLeft, Send } from 'lucide-react'
import { Topbar } from '../../components/Layout'
import { useAuth } from '../../lib/AuthContext'
import { addMessage, getItem, openAttachment } from '../../lib/api'
import { Avatar, Badge, ErrorNote, FileTile, PriorityBadge, Spinner, errMsg, useAsync, useToast } from '../../components/ui'
import { fmtDateTimeLong, fmtTime, fmtDate, pesoShort, ticketStatus, txnStatus, verdictLabel } from '../../lib/format'

export default function UserItemDetail() {
  const { kind, id } = useParams()
  const { profile } = useAuth()
  const toast = useToast()
  const { state } = useLocation()
  const replyRef = useRef(null)
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const { data, loading, error, reload } = useAsync(() => getItem(kind, id), [kind, id])
  const isTicket = kind === 'ticket'

  useEffect(() => { if (data && state?.focusReply) replyRef.current?.focus() }, [data, state])

  if (loading && !data) return <><Topbar title="Ticket" /><div className="content"><Spinner /></div></>
  if (error) return <><Topbar title="Ticket" /><div className="content"><ErrorNote error={error} onRetry={reload} /></div></>

  const { item, messages, events, files } = data
  const st = isTicket ? ticketStatus(item.status) : txnStatus(item)
  const closed = isTicket && item.status === 'resolved'

  const send = async (e) => {
    e.preventDefault()
    if (!body.trim()) return
    setBusy(true)
    try { await addMessage(profile.id, kind, id, body); setBody(''); reload() }
    catch (e2) { toast(errMsg(e2), 'err') } finally { setBusy(false) }
  }

  return (
    <>
      <Topbar left={<Link to="/tickets" className="back"><ArrowLeft size={15} /> My Tickets</Link>}>
        <span className="muted small">{item.code}</span>
      </Topbar>
      <div className="content">
        <div className="split">
          <div className="stack gap24">
            <div className="card">
              <div className="row between wrap gap12">
                <h2 className="h-lg">{isTicket ? item.subject : `Payment to ${item.recipient_name}`}</h2>
                <div className="row gap8"><PriorityBadge value={item.priority} /><Badge kind={st.key} dot>{st.label}</Badge></div>
              </div>
              <p className="small muted">{item.code} · Submitted {fmtDateTimeLong(item.created_at)}</p>

              {isTicket ? (
                <>
                  <dl className="kv mt16">
                    <div><dt>Incident type</dt><dd>{item.type}</dd></div>
                    <div><dt>Occurred</dt><dd>{item.occurred_at ? fmtDateTimeLong(item.occurred_at) : '—'}</dd></div>
                    <div><dt>Handled by</dt><dd>{item.assignee?.full_name || 'Waiting for assignment'}</dd></div>
                  </dl>
                  <span className="label mt16">Description</span>
                  <p className="pre">{item.description}</p>
                </>
              ) : (
                <>
                  <dl className="kv mt16">
                    <div><dt>Recipient</dt><dd>{item.recipient_name}</dd></div>
                    <div><dt>Amount</dt><dd>{pesoShort(item.amount)}</dd></div>
                    <div><dt>Channel</dt><dd>{item.channel}</dd></div>
                    <div><dt>Account</dt><dd>{item.account_number}</dd></div>
                    <div><dt>Request source</dt><dd>{item.request_source || '—'}</dd></div>
                  </dl>
                  {item.notes && <><span className="label mt16">Your notes</span><p className="pre">{item.notes}</p></>}
                  <div className={`notice ${item.verdict === 'safe' ? 'green' : item.verdict === 'suspicious' ? 'red' : item.verdict ? 'amber' : 'purple'} mt16`}>
                    <div>
                      <b>Verdict: {verdictLabel(item.verdict)}</b>
                      {!item.verdict && <div>Our team is cross-checking this request. Do not send payment until you receive our verdict.</div>}
                      {item.verdict === 'suspicious' && <div>Do not send this payment. Contact the recipient through a number you already trust.</div>}
                      {item.verdict === 'safe' && <div>Our checks found nothing wrong. Still confirm the amount and account before you pay.</div>}
                    </div>
                  </div>
                </>
              )}

              {files.length > 0 && (
                <>
                  <span className="label mt16">Attached evidence</span>
                  <div className="chips-row">{files.map((f) => <FileTile key={f.id} file={f} onOpen={(x) => openAttachment(x.file_path).catch((e) => toast(errMsg(e), 'err'))} />)}</div>
                </>
              )}
            </div>

            <div className="card">
              <h2 className="h-md">Conversation</h2>
              
<div className="thread">
  {messages.length === 0 && (
    <p className="muted">No messages yet.</p>
  )}

  {messages.map((m) => {
    const system = m.is_system === true
    const mine = !system && m.author_id === profile.id

    const sender = system
      ? 'CyberHelpDesk'
      : mine
        ? 'You'
        : m.author?.full_name || 'Support'

    return (
      <div
        className={`msg ${mine || system ? '' : 'staff'}`}
        key={m.id}
      >
        <Avatar
          name={sender}
          src={system ? undefined : m.author?.avatar_url}
          size={32}
          tone={mine ? 'gray' : 'blue'}
        />

        <div>
          <div className="msg-meta">
            <b>{sender}</b>

            {system && <Badge kind="new">System</Badge>}
            {!mine && !system && <Badge kind="new">Support</Badge>}

            <span>
              {fmtTime(m.created_at)} · {fmtDate(m.created_at)}
            </span>
          </div>

          <div className="bubble">{m.body}</div>
        </div>
      </div>
    )
  })}
</div>
              {closed ? <p className="muted small">This ticket is resolved. Report a new incident if the problem comes back.</p> : (
                <form onSubmit={send} className="stack gap8">
                  <textarea ref={replyRef} className="textarea" rows={3} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write a reply…" />
                  <div><button className="btn btn-primary" disabled={busy || !body.trim()}><Send size={14} /> Send reply</button></div>
                </form>
              )}
            </div>
          </div>

          <aside className="card">
            <h2 className="h-md">Activity</h2>
            <ul className="activity">
              {events.map((e) => (
                <li key={e.id}><i className="dot b" /><div><b>{e.message}</b><span>{fmtDateTimeLong(e.created_at)}</span></div></li>
              ))}
            </ul>
          </aside>
        </div>
      </div>
    </>
  )
}
