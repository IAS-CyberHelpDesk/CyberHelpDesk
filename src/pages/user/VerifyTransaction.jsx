import { useEffect, useState } from 'react'
import { Clock, ShieldCheck } from 'lucide-react'
import { Topbar } from '../../components/Layout'
import { useAuth } from '../../lib/AuthContext'
import { createTransaction, listMyTransactions } from '../../lib/api'
import { Badge, DropZone, Field, errMsg, useAsync, useToast } from '../../components/ui'
import { CHANNELS } from '../../lib/constants'
import { fmtDate, fmtDateTime, pesoShort, txnStatus } from '../../lib/format'
import { Link } from 'react-router-dom'

const blank = { recipient_name: '', channel: '', account_number: '', amount: '', request_source: '', notes: '' }

export default function VerifyTransaction() {
  const { profile } = useAuth()
  const toast = useToast()
  const [f, setF] = useState(blank)
  const [files, setFiles] = useState([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [selected, setSelected] = useState(null)
  const { data: list, reload } = useAsync(() => listMyTransactions(profile.id), [profile.id])
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  useEffect(() => { if (list?.length && !selected) setSelected(list[0].id) }, [list, selected])
  const current = list?.find((t) => t.id === selected)

  const submit = async (e) => {
    e.preventDefault()
    setErr('')
    if (!(Number(f.amount) > 0)) return setErr('Enter an amount greater than zero.')
    setBusy(true)
    try {
      const t = await createTransaction(profile.id, f, files)
      toast(`${t.code} submitted. Please wait for our verdict before paying.`)
      setF(blank); setFiles([]); setSelected(t.id)
      reload()
    } catch (e2) { setErr(errMsg(e2)) } finally { setBusy(false) }
  }

  const stepState = (t) => {
    if (!t) return ['pending', 'pending', 'pending', 'pending']
    if (t.status === 'verdict_issued') return ['done', 'done', 'done', 'done']
    if (t.status === 'under_review') return ['done', 'active', 'pending', 'pending']
    return ['done', 'pending', 'pending', 'pending']
  }
  const st = stepState(current)
  const stepRows = [
    ['Submitted', current ? fmtDateTime(current.created_at) : 'Waiting for your request'],
    ['Under Review', st[1] === 'active' ? 'In progress' : st[1] === 'done' ? 'Completed' : 'Pending'],
    ['Verdict Issued', current?.verdict_at ? fmtDateTime(current.verdict_at) : 'Pending'],
    ['Response Sent to You', current?.verdict_at ? 'Sent' : 'Pending'],
  ]

  return (
    <>
      <Topbar title="Verify a Transaction" />
      <div className="content">
        <div className="notice purple big">
          <span className="stat-icon solid purple"><ShieldCheck size={18} /></span>
          <div>
            <b>We act as a middleman before you pay</b>
            <div>Send us the payment request or transaction details below. Our team cross-checks the recipient, account details, and known scam patterns before you send money.</div>
          </div>
        </div>

        <div className="split mt24">
          <form className="card stack gap16" onSubmit={submit}>
            <h2 className="h-md">Transaction Details</h2>
            <div className="grid g2">
              <Field label="Recipient / Requester Name"><input className="input" required value={f.recipient_name} onChange={set('recipient_name')} placeholder="e.g. Juan Dela Cruz" /></Field>
              <Field label="Payment Channel">
                <input className="input" required list="channels" value={f.channel} onChange={set('channel')} placeholder="Bank Transfer / GCash / PayPal" />
                <datalist id="channels">{CHANNELS.map((c) => <option key={c} value={c} />)}</datalist>
              </Field>
              <Field label="Bank / E-Wallet Account Number"><input className="input" required value={f.account_number} onChange={set('account_number')} placeholder="0000-0000-0000" /></Field>
              <Field label="Amount (PHP)"><input className="input" required type="number" min="0.01" step="0.01" value={f.amount} onChange={set('amount')} placeholder="₱ 0.00" /></Field>
            </div>
            <Field label="Where Did This Request Come From?"><input className="input" required value={f.request_source} onChange={set('request_source')} placeholder="Email / SMS / Messenger / Phone Call" /></Field>
            <div>
              <span className="label">Upload Proof (invoice, message screenshot, email)</span>
              <DropZone files={files} setFiles={setFiles} title="Drag & drop or click to upload" hint="PNG, JPG, PDF up to 10MB" onError={setErr} />
            </div>
            <Field label="Additional Notes (optional)"><textarea className="textarea" rows={3} value={f.notes} onChange={set('notes')} placeholder="Anything else our reviewers should know…" /></Field>
            {err && <div className="form-error" role="alert">{err}</div>}
            <div className="row gap12 wrap">
              <button className="btn btn-purple" disabled={busy}>{busy ? 'Submitting…' : 'Submit for Verification'}</button>
              <span className="warn-text"><Clock size={13} /> Do not send payment until you receive our verdict</span>
            </div>
          </form>

          <aside className="card">
            <h2 className="h-md">Verification Status</h2>
            <p className="small muted">{current ? `Request #${current.code} · Est. turnaround: 2–4 hours` : 'Submit a request to track it here.'}</p>
            <ol className="vsteps">
              {stepRows.map(([l, s], i) => (
                <li key={l} className={st[i]}><span className="vdot" /><div><b>{l}</b><span>{s}</span></div></li>
              ))}
            </ol>
            {current?.verdict === 'needs_info' && (
              <div className="notice amber"><div><b>We need more information</b><div>Open the request and reply so we can finish. <Link className="link" to={`/tickets/txn/${current.id}`}>Open request</Link></div></div></div>
            )}
            <div className="legend">
              <b>Possible verdicts</b>
              <span><i className="dot g" /> Verified Safe to Proceed</span>
              <span><i className="dot r" /> Flagged as Suspicious</span>
              <span><i className="dot a" /> Needs More Information</span>
            </div>
          </aside>
        </div>

        <div className="card flush mt24">
          <div className="card-head"><h2 className="h-md">Your Past Verification Requests</h2></div>
          {!list?.length ? <div className="pad muted">Nothing yet. Your requests will appear here.</div> : (
            <div className="table-wrap">
              <table className="tbl">
                <thead><tr><th>Request ID</th><th>Recipient</th><th>Amount</th><th>Channel</th><th>Verdict</th><th>Date</th></tr></thead>
                <tbody>
                  {list.map((t) => {
                    const s = txnStatus(t)
                    return (
                      <tr key={t.id} className={`clickable ${selected === t.id ? 'sel' : ''}`} onClick={() => setSelected(t.id)}>
                        <td className="strong"><Link className="plain" to={`/tickets/txn/${t.id}`} onClick={(e) => e.stopPropagation()}>{t.code}</Link></td>
                        <td>{t.recipient_name}</td>
                        <td>{pesoShort(t.amount)}</td>
                        <td>{t.channel}</td>
                        <td>{t.verdict ? <Badge kind={s.key}>{s.label}</Badge> : <Badge kind="under_review">Pending</Badge>}</td>
                        <td>{fmtDate(t.created_at)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
