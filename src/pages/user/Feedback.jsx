import { useState } from 'react'
import { Topbar } from '../../components/Layout'
import { useAuth } from '../../lib/AuthContext'
import { listFeedbackable, listMyFeedback, submitFeedback } from '../../lib/api'
import { Empty, Field, Stars, errMsg, useAsync, useToast } from '../../components/ui'
import { fmtDate } from '../../lib/format'

export default function Feedback() {
  const { profile } = useAuth()
  const toast = useToast()
  const [pick, setPick] = useState('')
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const options = useAsync(() => listFeedbackable(profile.id), [profile.id])
  const past = useAsync(() => listMyFeedback(profile.id), [profile.id])
  const list = options.data || []
  const chosen = list.find((o) => `${o.kind}:${o.id}` === (pick || (list[0] && `${list[0].kind}:${list[0].id}`)))

  const submit = async (e) => {
    e.preventDefault()
    setErr('')
    if (!chosen) return setErr('Choose a resolved ticket to rate.')
    if (!rating) return setErr('Tap a star rating first.')
    setBusy(true)
    try {
      await submitFeedback(profile.id, chosen, rating, comment)
      toast('Thanks — your feedback was sent.')
      setRating(0); setComment(''); setPick('')
      options.reload(); past.reload()
    } catch (e2) { setErr(errMsg(e2)) } finally { setBusy(false) }
  }

  return (
    <>
      <Topbar title="Feedback" />
      <div className="content">
        <div className="split">
          <form className="card stack gap16" onSubmit={submit}>
            <h2 className="h-md">Rate a Resolved Ticket</h2>
            {options.data && list.length === 0 ? (
              <Empty title="Nothing to rate right now">Resolved tickets and answered verification requests will show up here.</Empty>
            ) : (
              <>
                <Field label="Ticket">
                  <select className="select" value={chosen ? `${chosen.kind}:${chosen.id}` : ''} onChange={(e) => setPick(e.target.value)}>
                    {list.map((o) => (
                      <option key={`${o.kind}:${o.id}`} value={`${o.kind}:${o.id}`}>{o.code} · {o.label} — Resolved {fmtDate(o.when)}</option>
                    ))}
                  </select>
                </Field>
                <div>
                  <span className="label">How satisfied were you with the resolution?</span>
                  <Stars value={rating} onChange={setRating} />
                </div>
                <Field label="Comments (optional)"><textarea className="textarea" rows={4} maxLength={1000} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Tell us how the helpdesk handled your report…" /></Field>
                {err && <div className="form-error" role="alert">{err}</div>}
                <div><button className="btn btn-primary" disabled={busy}>{busy ? 'Sending…' : 'Submit Feedback'}</button></div>
              </>
            )}
          </form>

          <aside className="card">
            <h2 className="h-md">Your Past Feedback</h2>
            {!past.data?.length ? <p className="muted">No feedback yet.</p> : (
              <ul className="fb-list">
                {past.data.map((f) => (
                  <li key={f.id}>
                    <div className="row gap8"><i className="dot a" /><b>{f.ticket?.code || f.txn?.code}</b><Stars value={f.rating} size={13} /></div>
                    {f.comment && <p className="small muted">“{f.comment}”</p>}
                  </li>
                ))}
              </ul>
            )}
          </aside>
        </div>
      </div>
    </>
  )
}
