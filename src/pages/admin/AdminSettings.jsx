import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { Topbar } from '../../components/Layout'
import { useAuth } from '../../lib/AuthContext'
import { getAdminSettings, updateAdminSettings, updateProfile, uploadAvatar } from '../../lib/api'
import { Avatar, ErrorNote, Field, Spinner, Toggle, errMsg, useAsync, useToast } from '../../components/ui'

export default function AdminSettings() {
  const { profile, refreshProfile } = useAuth()
  const toast = useToast()
  const fileRef = useRef(null)
  const init = () => ({ full_name: profile.full_name || '', admin_title: profile.admin_title || '' })
  const [f, setF] = useState(init)
  const [saving, setSaving] = useState(false)
  const [kw, setKw] = useState('')
  const { data: cfg, error, reload } = useAsync(getAdminSettings, [])
  const [local, setLocal] = useState(null)
  useEffect(() => { if (cfg) setLocal(cfg) }, [cfg])

  const saveProfile = async () => {
    setSaving(true)
    try { await updateProfile(profile.id, f); await refreshProfile(); toast('Changes saved.') }
    catch (e) { toast(errMsg(e), 'err') } finally { setSaving(false) }
  }
  const patch = async (p) => {
    const prev = local
    setLocal({ ...local, ...p })
    try { await updateAdminSettings(p) } catch (e) { setLocal(prev); toast(errMsg(e), 'err') }
  }
  const addKw = () => {
    const v = kw.trim().toLowerCase()
    if (!v || local.priority_keywords.includes(v)) return setKw('')
    patch({ priority_keywords: [...local.priority_keywords, v] }); setKw('')
  }
  const photo = async (e) => {
    const file = e.target.files?.[0]; if (!file) return
    try { await uploadAvatar(profile.id, file); await refreshProfile(); toast('Photo updated.') } catch (e2) { toast(errMsg(e2), 'err') }
  }

  return (
    <>
      <Topbar title="Settings" />
      <div className="content">
        <p className="page-sub">Manage your admin profile and how the helpdesk handles incoming tickets.</p>
        <div className="split even">
          <div className="card stack gap16">
            <div><h2 className="h-md">Admin profile</h2><p className="small muted">Shown to users on tickets you handle.</p></div>
            <div className="row between">
              <div className="row gap16">
                <Avatar name={profile.full_name} src={profile.avatar_url} size={56} />
                <div><b>{profile.full_name}</b><div><span className="pill cyan">{profile.admin_title || 'Admin'}</span></div></div>
              </div>
              <button className="btn btn-outline" onClick={() => fileRef.current?.click()}>Change photo</button>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={photo} />
            </div>
            <div className="grid g2">
              <Field label="Full name"><input className="input" value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></Field>
              <Field label="Role"><input className="input" value={f.admin_title} onChange={(e) => setF({ ...f, admin_title: e.target.value })} placeholder="Senior Support Admin" /></Field>
            </div>
            <Field label="Email address"><input className="input" value={profile.email || ''} disabled /></Field>
            <div className="row gap8 end">
              <button className="btn btn-outline" onClick={() => setF(init())}>Discard</button>
              <button className="btn btn-primary" disabled={saving} onClick={saveProfile}>{saving ? 'Saving…' : 'Save changes'}</button>
            </div>
          </div>

          <div className="card">
            <h2 className="h-md">Helpdesk configuration</h2>
            <p className="small muted">Rules applied automatically to new tickets.</p>
            {error ? <ErrorNote error={error} onRetry={reload} /> : !local ? <Spinner /> : (
              <>
                <div className="setting"><div><b>Auto-assign new tickets</b><span>Round-robin to whoever has the fewest open items</span></div><Toggle label="Auto-assign" checked={local.auto_assign} onChange={(v) => patch({ auto_assign: v })} /></div>
                <div className="setting col">
                  <div className="row between">
                    <div><b>Auto-prioritize by keywords</b><span>Tickets containing these words are flagged High</span></div>
                    <Toggle label="Auto-prioritize" checked={local.auto_prioritize} onChange={(v) => patch({ auto_prioritize: v })} />
                  </div>
                  <div className="chips-row">
                    {local.priority_keywords.map((k) => (
                      <span key={k} className="kw">{k}<button aria-label={`Remove ${k}`} onClick={() => patch({ priority_keywords: local.priority_keywords.filter((x) => x !== k) })}><X size={12} /></button></span>
                    ))}
                    <input className="kw-input" value={kw} onChange={(e) => setKw(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addKw()} placeholder="Add word" aria-label="Add keyword" />
                  </div>
                </div>
                <div className="setting"><div><b>SLA breach alerts</b><span>Notify admins when a ticket nears its deadline</span></div><Toggle label="SLA alerts" checked={local.sla_alerts} onChange={(v) => patch({ sla_alerts: v })} /></div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
