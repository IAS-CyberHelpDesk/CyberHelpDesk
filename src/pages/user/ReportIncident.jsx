import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check } from 'lucide-react'
import { Topbar } from '../../components/Layout'
import { useAuth } from '../../lib/AuthContext'
import { getLatestDraft, saveIncident } from '../../lib/api'
import { DropZone, Field, errMsg, useToast } from '../../components/ui'
import { INCIDENT_TYPES, SEVERITIES } from '../../lib/constants'
import { cap, fmtSize } from '../../lib/format'

const toLocalInput = (d) => {
  const x = new Date(d)
  x.setMinutes(x.getMinutes() - x.getTimezoneOffset())
  return x.toISOString().slice(0, 16)
}

export default function ReportIncident() {
  const { profile } = useAuth()
  const toast = useToast()
  const nav = useNavigate()
  const [step, setStep] = useState(0)
  const [draftId, setDraftId] = useState(null)
  const [files, setFiles] = useState([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [f, setF] = useState({ type: 'Phishing', subject: '', description: '', occurred_at: toLocalInput(new Date()), severity: 'medium' })
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }))

  useEffect(() => {
    getLatestDraft(profile.id).then((d) => {
      if (!d) return
      setDraftId(d.id)
      setF({ type: d.type, subject: d.subject, description: d.description || '', occurred_at: d.occurred_at ? toLocalInput(d.occurred_at) : toLocalInput(new Date()), severity: d.severity })
      toast('We restored your saved draft.')
    }).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.id])

  const valid = f.subject.trim().length >= 3 && f.description.trim().length >= 10
  const next = () => {
    if (!valid) return setErr('Add a short subject and a description of at least 10 characters.')
    setErr(''); setStep(1)
  }

  const save = async (asDraft) => {
    setBusy(true); setErr('')
    try {
      if (asDraft && f.subject.trim().length < 1) throw new Error('Add a subject before saving a draft.')
      const t = await saveIncident(profile.id, draftId, f, files, asDraft)
      if (asDraft) { setDraftId(t.id); setFiles([]); toast('Draft saved.') }
      else { toast(`${t.code} submitted. We’ll update you here.`); nav(`/tickets/ticket/${t.id}`) }
    } catch (e) { setErr(errMsg(e)) } finally { setBusy(false) }
  }

  const steps = ['Incident Details', 'Evidence', 'Review & Submit']

  return (
    <>
      <Topbar title="Report a Cybersecurity Incident" />
      <div className="content">
        <div className="split">
          <div className="stack gap24">
            <ol className="stepper card" aria-label="Progress">
              {steps.map((s, i) => (
                <li key={s} className={i === step ? 'on' : i < step ? 'done' : ''}>
                  <span>{i < step ? <Check size={13} /> : null}</span>{s}
                </li>
              ))}
            </ol>

            <div className="card">
              {step === 0 && (
                <div className="stack gap16">
                  <div>
                    <span className="label">Incident Type</span>
                    <div className="chips-row">
                      {INCIDENT_TYPES.map((t) => (
                        <button key={t} type="button" className={`chip ${f.type === t ? 'on' : ''}`} onClick={() => set('type', t)}>{t}</button>
                      ))}
                    </div>
                  </div>
                  <Field label="Subject"><input className="input" maxLength={140} value={f.subject} onChange={(e) => set('subject', e.target.value)} placeholder="Brief summary of the incident" /></Field>
                  <Field label="Description"><textarea className="textarea" rows={4} value={f.description} onChange={(e) => set('description', e.target.value)} placeholder="Describe what happened, when you noticed it, and any actions already taken…" /></Field>
                  <Field label="Date & Time Occurred"><input className="input" type="datetime-local" max={toLocalInput(new Date())} value={f.occurred_at} onChange={(e) => set('occurred_at', e.target.value)} /></Field>
                  <div>
                    <span className="label">Upload Evidence (screenshots, emails, files)</span>
                    <DropZone files={files} setFiles={setFiles} onError={setErr} />
                  </div>
                  <div>
                    <span className="label">Self-Assessed Severity</span>
                    <div className="chips-row">
                      {SEVERITIES.map((s) => (
                        <button key={s} type="button" className={`chip sev-${s} ${f.severity === s ? 'on' : ''}`} onClick={() => set('severity', s)}>{cap(s)}</button>
                      ))}
                    </div>
                  </div>
                  {err && <div className="form-error" role="alert">{err}</div>}
                  <div className="row gap8">
                    <button className="btn btn-primary" onClick={next}>Continue to Evidence Review →</button>
                    <button className="btn btn-outline" disabled={busy} onClick={() => save(true)}>Save as Draft</button>
                  </div>
                </div>
              )}

              {step === 1 && (
                <div className="stack gap16">
                  <h2 className="h-md">Evidence</h2>
                  <p className="muted">Add anything that shows what happened — original emails and screenshots are better than retyped text.</p>
                  <DropZone files={files} setFiles={setFiles} onError={setErr} />
                  {files.length === 0 && <p className="small muted">No files attached. You can still submit without evidence.</p>}
                  {err && <div className="form-error" role="alert">{err}</div>}
                  <div className="row gap8">
                    <button className="btn btn-outline" onClick={() => setStep(0)}>Back</button>
                    <button className="btn btn-primary" onClick={() => setStep(2)}>Continue to Review →</button>
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="stack gap16">
                  <h2 className="h-md">Review & Submit</h2>
                  <dl className="kv">
                    <div><dt>Type</dt><dd>{f.type}</dd></div>
                    <div><dt>Severity</dt><dd>{cap(f.severity)}</dd></div>
                    <div><dt>Occurred</dt><dd>{new Date(f.occurred_at).toLocaleString()}</dd></div>
                    <div><dt>Evidence</dt><dd>{files.length ? files.map((x) => `${x.name} (${fmtSize(x.size)})`).join(', ') : 'None'}</dd></div>
                  </dl>
                  <div><span className="label">Subject</span><p>{f.subject}</p></div>
                  <div><span className="label">Description</span><p className="pre">{f.description}</p></div>
                  {err && <div className="form-error" role="alert">{err}</div>}
                  <div className="row gap8">
                    <button className="btn btn-outline" onClick={() => setStep(1)}>Back</button>
                    <button className="btn btn-primary" disabled={busy} onClick={() => save(false)}>{busy ? 'Submitting…' : 'Submit report'}</button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <aside className="card tips">
            <h2 className="h-md">Tips for Reporting</h2>
            <ul>
              <li>Include full sender email addresses and URLs — don’t just describe them.</li>
              <li>Attach original screenshots rather than retyped text when possible.</li>
              <li>Report as soon as you notice something suspicious, even if unsure.</li>
              <li>Do not click suspicious links again before reporting.</li>
            </ul>
            <div className="notice amber"><div><b>Note</b><div>We do not connect to global threat databases — our team manually reviews each report.</div></div></div>
          </aside>
        </div>
      </div>
    </>
  )
}
