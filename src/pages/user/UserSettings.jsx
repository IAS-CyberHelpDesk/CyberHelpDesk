import { useEffect, useRef, useState } from 'react'
import { Topbar } from '../../components/Layout'
import { useAuth } from '../../lib/AuthContext'
import { changePassword, updateProfile, uploadAvatar } from '../../lib/api'
import { Avatar, Field, Toggle, errMsg, useToast } from '../../components/ui'

export default function UserSettings() {
  const { profile, refreshProfile } = useAuth()
  const toast = useToast()
  const fileRef = useRef(null)
  const init = () => ({ full_name: profile.full_name || '', business_name: profile.business_name || '', phone: profile.phone || '' })
  const [f, setF] = useState(init)
  const [saving, setSaving] = useState(false)
  const [pw, setPw] = useState({ current: '', next: '' })
  const [pwBusy, setPwBusy] = useState(false)
  const [pwErr, setPwErr] = useState('')
  useEffect(() => setF(init()), [profile.id]) // eslint-disable-line

  const save = async () => {
    setSaving(true)
    try { await updateProfile(profile.id, f); await refreshProfile(); toast('Changes saved.') }
    catch (e) { toast(errMsg(e), 'err') } finally { setSaving(false) }
  }
  const toggle = async (key, value) => {
    try { await updateProfile(profile.id, { [key]: value }); await refreshProfile() }
    catch (e) { toast(errMsg(e), 'err') }
  }
  const photo = async (e) => {
    const file = e.target.files?.[0]; if (!file) return
    if (file.size > 2 * 1024 * 1024) return toast('Photo must be under 2MB.', 'err')
    try { await uploadAvatar(profile.id, file); await refreshProfile(); toast('Photo updated.') }
    catch (e2) { toast(errMsg(e2), 'err') }
  }
  const updatePw = async () => {
    setPwErr('')
    if (pw.next.length < 12) return setPwErr('Use at least 12 characters.')
    if (!/[a-z]/i.test(pw.next) || !/\d/.test(pw.next) || !/[^a-z0-9]/i.test(pw.next)) return setPwErr('Mix letters, numbers and symbols.')
    setPwBusy(true)
    try { await changePassword(profile.email, pw.current, pw.next); setPw({ current: '', next: '' }); toast('Password updated.') }
    catch (e) { setPwErr(errMsg(e)) } finally { setPwBusy(false) }
  }

  return (
    <>
      <Topbar title="Settings" />
      <div className="content">
        <p className="page-sub">Manage your profile, password and how we contact you.</p>
        <div className="split">
          <div className="stack gap24">
            <div className="card stack gap16">
              <div><h2 className="h-md">Profile</h2><p className="small muted">Your contact details for ticket updates and verdicts.</p></div>
              <div className="row between">
                <div className="row gap16">
                  <Avatar name={profile.full_name} src={profile.avatar_url} size={56} />
                  <div><b>{profile.full_name}</b><div className="small muted">{profile.business_name}</div></div>
                </div>
                <button className="btn btn-outline" onClick={() => fileRef.current?.click()}>Change photo</button>
                <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={photo} />
              </div>
              <div className="grid g2">
                <Field label="Full name"><input className="input" value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></Field>
                <Field label="Business name"><input className="input" value={f.business_name} onChange={(e) => setF({ ...f, business_name: e.target.value })} /></Field>
                <Field label="Email address" hint="Email changes aren’t available here."><input className="input" value={profile.email || ''} disabled /></Field>
                <Field label="Phone number"><input className="input" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="+63 917 000 0000" /></Field>
              </div>
              <div className="row gap8 end">
                <button className="btn btn-outline" onClick={() => setF(init())}>Discard</button>
                <button className="btn btn-primary" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save changes'}</button>
              </div>
            </div>

            <div className="card stack gap16">
              <div><h2 className="h-md">Password</h2><p className="small muted">Use at least 12 characters with a mix of letters, numbers and symbols.</p></div>
              <div className="grid g2">
                <Field label="Current password"><input className="input" type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} /></Field>
                <Field label="New password"><input className="input" type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} placeholder="Enter a new password" /></Field>
              </div>
              {pwErr && <div className="form-error" role="alert">{pwErr}</div>}
              <div className="row end"><button className="btn btn-outline" disabled={pwBusy || !pw.current || !pw.next} onClick={updatePw}>{pwBusy ? 'Updating…' : 'Update password'}</button></div>
            </div>
          </div>

          <aside className="card">
            <h2 className="h-md">Notifications</h2>
            <p className="small muted">Choose how we reach you.</p>
            <div className="group-label">Email</div>
            <div className="setting"><div><b>Ticket status changes</b><span>Get notified when an admin updates your ticket</span></div><Toggle label="Ticket status changes" checked={profile.notify_ticket_status} onChange={(v) => toggle('notify_ticket_status', v)} /></div>
            <div className="setting"><div><b>Transaction verdicts</b><span>Verified safe or flagged results</span></div><Toggle label="Transaction verdicts" checked={profile.notify_verdicts} onChange={(v) => toggle('notify_verdicts', v)} /></div>
            <div className="group-label">SMS</div>
            <div className="setting"><div><b>High-priority reports</b><span>Only for incidents marked High severity</span></div><Toggle label="High-priority SMS" checked={profile.sms_high_priority} onChange={(v) => toggle('sms_high_priority', v)} /></div>
            <p className="small muted mt16">These choices are saved to your account. Sending email or SMS needs a messaging provider hooked up in Supabase (see README).</p>
          </aside>
        </div>
      </div>
    </>
  )
}
