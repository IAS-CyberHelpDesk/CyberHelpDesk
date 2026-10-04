import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, Lock, ShieldAlert, Users } from 'lucide-react'
import { Topbar } from '../../components/Layout'
import { useAuth } from '../../lib/AuthContext'
import { addMessage, cosign, getAdminTransaction, issueVerdict, listAdmins, openAttachment, reauthenticate, requestCosign, updateTransaction } from '../../lib/api'
import { Avatar, Badge, ErrorNote, FileTile, Modal, PriorityBadge, Spinner, errMsg, useAsync, useToast } from '../../components/ui'
import { DUAL_APPROVAL_THRESHOLD } from '../../lib/constants'
import { fmtDateTimeLong, fmtTime, peso, remaining, txnStatus, verdictLabel } from '../../lib/format'

const VERDICTS = {
  safe: { title: 'Confirm safe to proceed', body: 'The requester will be told this payment checked out.', btn: 'btn-green' },
  suspicious: { title: 'Flag as suspicious', body: 'The requester will be told not to send this payment.', btn: 'btn-red' },
  needs_info: { title: 'Request more information', body: 'Your justification is sent to the requester as a message so they can answer.', btn: 'btn-primary' },
}

export default function AdminTransactionDetail() {
  const { id } = useParams()
  const { profile } = useAuth()
  const toast = useToast()
  const opened = useRef(false)
  const { data, error, reload } = useAsync(async () => {
    const [d, admins] = await Promise.all([getAdminTransaction(id), listAdmins()])
    return { ...d, admins }
  }, [id])
  const [justification, setJustification] = useState('')
  const [note, setNote] = useState('')
  const [pending, setPending] = useState(null) // verdict awaiting re-auth
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [mErr, setMErr] = useState('')
  const [checklist, setChecklist] = useState({})

  useEffect(() => { if (data) setChecklist(data.item.checklist || {}) }, [data])

  // First admin to open a new request moves it into review
  useEffect(() => {
    if (!data || opened.current || data.item.status !== 'submitted') return
    opened.current = true
    updateTransaction(id, { status: 'under_review', assigned_to: data.item.assigned_to || profile.id }).then(reload).catch(() => {})
  }, [data, id, profile.id, reload])

  const feed = useMemo(() => {
    if (!data) return []
    const e = data.events.map((x) => ({ t: x.created_at, k: 'evt', x }))
    const m = data.messages.map((x) => ({ t: x.created_at, k: 'msg', x }))
    return [...e, ...m].sort((a, b) => new Date(b.t) - new Date(a.t))
  }, [data])

  if (error) return <><Topbar title="Verification" /><div className="content"><ErrorNote error={error} onRetry={reload} /></div></>
  if (!data) return <><Topbar title="Verification" /><div className="content"><Spinner /></div></>

  const { item: t, files, checklistItems, admins } = data
  const st = txnStatus(t)
  const issued = t.verdict && t.verdict !== 'needs_info'
  const done = checklistItems.filter((c) => checklist[c.key]).length
  const req = checklistItems.filter((c) => c.required)
  const reqDone = req.filter((c) => checklist[c.key]).length
  const reqLeft = req.length - reqDone
  const dual = Number(t.amount) >= DUAL_APPROVAL_THRESHOLD
  const needCosign = dual && !t.second_approver
  const score = t.risk_score ?? 0
  const risk = score >= 70 ? { l: 'High risk', c: '#DC2626', k: 'flagged' } : score >= 40 ? { l: 'Medium risk', c: '#D97706', k: 'in_progress' } : { l: 'Low risk', c: '#16A34A', k: 'safe' }
  const sla = remaining(t.due_at)
  const groups = [...new Set(checklistItems.map((c) => c.group_name))]
  const safeLocked = reqLeft > 0 || needCosign || !justification.trim()
  const lockReason = reqLeft > 0 ? `Locked — complete ${reqLeft} more required check${reqLeft > 1 ? 's' : ''} to unlock` : needCosign ? 'Locked — a second admin must co-sign' : !justification.trim() ? 'Add a justification to unlock' : ''
  const canCosign = dual && t.cosign_requested && !t.second_approver && t.assigned_to !== profile.id

  const run = async (fn, ok) => {
    setBusy(true)
    try { await fn(); if (ok) toast(ok); reload() } catch (e) { toast(errMsg(e), 'err') } finally { setBusy(false) }
  }
  const toggle = (key) => {
    if (issued) return
    const next = { ...checklist, [key]: !checklist[key] }
    setChecklist(next)
    updateTransaction(t.id, { checklist: next }).catch((e) => { setChecklist(checklist); toast(errMsg(e), 'err') })
  }
  const confirmVerdict = async () => {
    setMErr(''); setBusy(true)
    try {
      await reauthenticate(profile.email, pw)
      await issueVerdict(t.id, pending, justification.trim())
      toast(`Verdict sent: ${verdictLabel(pending)}.`)
      setPending(null); setPw(''); setJustification(''); reload()
    } catch (e) { setMErr(errMsg(e)) } finally { setBusy(false) }
  }
  const addNote = (internal) => {
    if (!note.trim()) return
    run(async () => { await addMessage(profile.id, 'txn', t.id, note, internal); setNote('') }, internal ? 'Note added.' : 'Message sent to the requester.')
  }

  return (
    <>
      <Topbar left={<div className="row gap12"><Link to="/admin/verifications" className="back"><ArrowLeft size={15} /> Verifications</Link><span className="sep">/</span><b className="h-md">{t.code}</b><Badge kind={st.key}>{st.label}</Badge><PriorityBadge value={t.priority} /></div>} />
      <div className="content">
        <div className="split">
          <div className="stack gap24">
            <div className="card">
              <h2 className="h-md">Transaction Verification Request</h2>
              <dl className="kv grid4 mt16">
                <div><dt>Submitted By</dt><dd>{t.submitter?.business_name || t.submitter?.full_name}</dd></div>
                <div><dt>Recipient</dt><dd>{t.recipient_name}</dd></div>
                <div><dt>Amount</dt><dd>{peso(t.amount)}</dd></div>
                <div><dt>Channel</dt><dd>{t.channel}</dd></div>
                <div><dt>Account Number</dt><dd>{t.account_number}</dd></div>
                <div><dt>Request Source</dt><dd>{t.request_source || '—'}</dd></div>
                <div><dt>Submitted</dt><dd>{fmtDateTimeLong(t.created_at)}</dd></div>
                <div><dt>Contact</dt><dd>{t.submitter?.full_name}</dd></div>
              </dl>
              {t.notes && <><span className="label mt16">Notes from Submitter</span><p className="pre quote">“{t.notes}”</p></>}
              <span className="label mt16">Attached Evidence</span>
              {files.length ? <div className="chips-row">{files.map((f) => <FileTile key={f.id} file={f} onOpen={(x) => openAttachment(x.file_path).catch((e) => toast(errMsg(e), 'err'))} />)}</div> : <p className="small muted">No files attached.</p>}
            </div>

            <div className="card">
              <div className="row between wrap gap8">
                <h2 className="h-md">Verification Checklist</h2>
                {issued ? <Badge kind="draft">Verdict issued</Badge> : reqLeft > 0 ? <Badge kind="in_progress">Verdict locked · {reqLeft} required check{reqLeft > 1 ? 's' : ''} left</Badge> : <Badge kind="safe">Required checks complete</Badge>}
              </div>
              <div className="row between small mt8"><span className="muted">{done} of {checklistItems.length} checks complete</span><b style={{ color: '#B45309' }}>{reqDone} of {req.length} required</b></div>
              <div className="bar blue"><i style={{ width: `${checklistItems.length ? (done / checklistItems.length) * 100 : 0}%` }} /></div>
              <div className="checklist">
                {groups.map((g) => {
                  const items = checklistItems.filter((c) => c.group_name === g)
                  return (
                    <div key={g}>
                      <div className="group-label row between"><span>{g}</span><span>{items.filter((c) => checklist[c.key]).length}/{items.length}</span></div>
                      {items.map((c) => (
                        <label key={c.key} className={`check-row ${checklist[c.key] ? 'on' : ''}`}>
                          <input type="checkbox" checked={!!checklist[c.key]} disabled={issued} onChange={() => toggle(c.key)} />
                          <span>{c.label}{c.required && <em> *</em>}</span>
                        </label>
                      ))}
                    </div>
                  )
                })}
              </div>
              <p className="small muted">* Required before a “safe” verdict can be sent</p>
            </div>

            <div className="card">
              <h2 className="h-md">Activity Log</h2>
              <ul className="activity">
                {feed.map((r) => r.k === 'evt' ? (
                  <li key={`e${r.x.id}`}><i className="dot b" /><div><b>{r.x.actor?.full_name || 'System'} <span className="muted fw4">· {fmtTime(r.x.created_at)}</span></b><span>{r.x.message}</span></div></li>
                ) : (
                  <li key={`m${r.x.id}`}><i className={`dot ${r.x.is_internal ? 'a' : 'b'}`} /><div><b>{r.x.author?.full_name} <span className="muted fw4">· {fmtTime(r.x.created_at)}{r.x.is_internal ? ' · internal note' : ' · message to requester'}</span></b><span className={r.x.is_internal ? 'note-text' : ''}>{r.x.body}</span></div></li>
                ))}
              </ul>
              <textarea className="textarea" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add an internal note or message to the reporter…" />
              <div className="row gap8 mt8"><button className="btn btn-outline sm" disabled={busy || !note.trim()} onClick={() => addNote(true)}>Add internal note</button><button className="btn btn-primary sm" disabled={busy || !note.trim()} onClick={() => addNote(false)}>Message reporter</button></div>
            </div>
          </div>

          <aside className="card stack gap16">
            <h2 className="h-md">Risk Assessment</h2>
            <div className="row gap12"><span className="score" style={{ color: risk.c }}>{score}</span><span className="muted">/ 100</span><Badge kind={risk.k}>{risk.l}</Badge></div>
            <div className="gauge"><i /><i /><i /><b style={{ left: `${Math.min(97, score)}%` }} /></div>
            <ul className="flags">
              {(t.risk_flags || []).map((f) => <li key={f}><AlertTriangle size={13} /> {f}</li>)}
              {!t.risk_flags?.length && <li className="muted">No automatic flags raised.</li>}
            </ul>
            <p className="small muted">The score is a rule-based estimate from payee history, amount and channel. It is not a verdict.</p>
            <hr />
            <label className="field"><span className="label">Assigned Admin</span>
              <select className="select" value={t.assigned_to || ''} disabled={busy || issued} onChange={(e) => run(() => updateTransaction(t.id, { assigned_to: e.target.value || null }), 'Assignee updated.')}>
                <option value="">Unassigned</option>{admins.map((a) => <option key={a.id} value={a.id}>{a.full_name}</option>)}
              </select></label>
            <div>
              <span className="label">SLA Timer</span>
              <div className={`sla-box ${sla.overdue && !issued ? 'late' : ''}`}><span>{issued ? 'Verdict issued' : sla.overdue ? 'Overdue by' : 'Time remaining'}</span>{!issued && <b>{sla.label}</b>}</div>
            </div>

            <div>
              <span className="label">Approval Controls</span>
              {dual ? (
                <div className="notice amber stack gap8">
                  <div className="row gap8"><Users size={16} /><b>Dual approval required</b></div>
                  <div className="small">Amount is {peso(DUAL_APPROVAL_THRESHOLD).replace('.00', '')} or more. A second admin must co-sign this verdict.</div>
                  <div className="row between small">
                    <b>Second approver: {t.second?.full_name || 'Unassigned'}</b>
                    {!t.second_approver && !t.cosign_requested && <button className="link" disabled={busy} onClick={() => run(() => requestCosign(t.id), 'Co-sign requested.')}>Request co-sign</button>}
                    {canCosign && <button className="link" disabled={busy} onClick={() => run(() => cosign(t.id), 'You co-signed this request.')}>Co-sign</button>}
                    {!t.second_approver && t.cosign_requested && !canCosign && <span className="muted">Waiting for co-sign</span>}
                  </div>
                </div>
              ) : <p className="small muted">Under the dual-approval limit — one admin can sign off.</p>}
            </div>

            {issued ? (
              <div className={`notice ${t.verdict === 'safe' ? 'green' : 'red'}`}><div><b>Verdict: {verdictLabel(t.verdict)}</b><div>{t.verdict_justification}</div></div></div>
            ) : (
              <>
                <label className="field"><span className="label">Verdict justification <em className="req">*</em></span>
                  <textarea className="textarea" rows={3} value={justification} onChange={(e) => setJustification(e.target.value)} placeholder="Explain your decision. This is saved to the audit log." /></label>
                <div className="stack gap8">
                  <span className="label">Send Verdict to User</span>
                  <button className="btn btn-green block" disabled={safeLocked} onClick={() => setPending('safe')}>{safeLocked && <Lock size={14} />} Confirm Safe to Proceed</button>
                  {safeLocked && lockReason && <div className="warn-text"><AlertTriangle size={13} /> {lockReason}</div>}
                  <button className="btn btn-red block" disabled={!justification.trim()} onClick={() => setPending('suspicious')}><ShieldAlert size={14} /> Flag as Suspicious</button>
                  <button className="btn btn-outline block" disabled={!justification.trim()} onClick={() => setPending('needs_info')}>Request More Information</button>
                </div>
              </>
            )}
            <p className="small muted">You’ll re-enter your password to send a verdict. Every action is recorded in the activity log.</p>
          </aside>
        </div>
      </div>

      {pending && (
        <Modal title={VERDICTS[pending].title} onClose={() => { setPending(null); setPw(''); setMErr('') }}
          footer={<><button className="btn btn-outline" onClick={() => { setPending(null); setPw(''); setMErr('') }}>Cancel</button><button className={`btn ${VERDICTS[pending].btn}`} disabled={busy || !pw} onClick={confirmVerdict}>{busy ? 'Sending…' : 'Confirm and send'}</button></>}>
          <p>{VERDICTS[pending].body}</p>
          <label className="field"><span className="label">Re-enter your password to confirm</span>
            <input className="input" type="password" autoFocus autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && pw && confirmVerdict()} /></label>
          {mErr && <div className="form-error" role="alert">{mErr}</div>}
        </Modal>
      )}
    </>
  )
}
