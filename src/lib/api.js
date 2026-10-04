import { supabase } from './supabase'
import { ticketStatus, txnStatus } from './format'

const must = ({ data, error }) => {
  if (error) throw error
  return data
}

const TICKET_SEL =
  '*, reporter:profiles!tickets_reporter_id_fkey(id,full_name,business_name,email,avatar_url), assignee:profiles!tickets_assigned_to_fkey(id,full_name,avatar_url)'
const TXN_SEL =
  '*, submitter:profiles!transactions_submitter_id_fkey(id,full_name,business_name,email,avatar_url), assignee:profiles!transactions_assigned_to_fkey(id,full_name,avatar_url), second:profiles!transactions_second_approver_fkey(id,full_name)'
const MSG_SEL = '*, author:profiles!messages_author_id_fkey(id,full_name,role,avatar_url)'
const EVT_SEL = '*, actor:profiles!events_actor_id_fkey(id,full_name,role)'

/* ---------- unified list rows (tickets + transaction requests) ---------- */
export function ticketRow(t) {
  const st = ticketStatus(t.status)
  return {
    kind: 'ticket', id: t.id, code: t.code,
    who: t.reporter?.business_name || t.reporter?.full_name || '—',
    type: `${t.type}${t.type === 'Phishing' ? ' Email' : ''}`,
    priority: t.priority, statusKey: st.key, statusLabel: st.label,
    assignee: t.assignee?.full_name || null, assigneeId: t.assigned_to,
    date: t.updated_at, created: t.created_at,
  }
}
export function txnRow(t) {
  const st = txnStatus(t)
  return {
    kind: 'txn', id: t.id, code: t.code,
    who: t.submitter?.business_name || t.submitter?.full_name || '—',
    type: 'Txn Verification', priority: t.priority, statusKey: st.key, statusLabel: st.label,
    assignee: t.assignee?.full_name || null, assigneeId: t.assigned_to,
    date: t.updated_at, created: t.created_at,
  }
}
const byDateDesc = (a, b) => new Date(b.date) - new Date(a.date)

/* ---------- files ---------- */
export async function uploadEvidence(userId, files, target) {
  for (const f of files) {
    const path = `${userId}/${crypto.randomUUID()}-${f.name.replace(/[^\w.\-]+/g, '_')}`
    const up = await supabase.storage.from('evidence').upload(path, f, { contentType: f.type || undefined })
    if (up.error) throw up.error
    must(
      await supabase.from('attachments').insert({
        ...target, uploaded_by: userId, file_path: path, file_name: f.name, size_bytes: f.size, mime_type: f.type || null,
      }),
    )
  }
}
export async function openAttachment(path) {
  const { data, error } = await supabase.storage.from('evidence').createSignedUrl(path, 300)
  if (error) throw error
  window.open(data.signedUrl, '_blank', 'noopener')
}
export async function listAttachments(target) {
  const [col, id] = Object.entries(target)[0]
  return must(await supabase.from('attachments').select('*').eq(col, id).order('created_at'))
}

/* =====================================================================
   USER SIDE
   ===================================================================== */
export async function getMyStats(uid) {
  const [tk, tx, fb] = await Promise.all([
    supabase.from('tickets').select('id,status').eq('reporter_id', uid).neq('status', 'draft'),
    supabase.from('transactions').select('id,status,verdict').eq('submitter_id', uid),
    supabase.from('feedback').select('rating').eq('user_id', uid),
  ])
  const tickets = must(tk), txns = must(tx), fbs = must(fb)
  const open = tickets.filter((t) => t.status !== 'resolved')
  const waiting = txns.filter((t) => t.verdict === 'needs_info')

  // "awaiting your reply" = open items whose newest visible message is from staff
  let awaiting = 0
  const ids = [...open.map((t) => ['ticket_id', t.id]), ...waiting.map((t) => ['transaction_id', t.id])]
  if (ids.length) {
    const tIds = open.map((t) => t.id), xIds = waiting.map((t) => t.id)
    const queries = []
    if (tIds.length) queries.push(supabase.from('messages').select('ticket_id,author_id,created_at').in('ticket_id', tIds).eq('is_internal', false).order('created_at', { ascending: false }))
    if (xIds.length) queries.push(supabase.from('messages').select('transaction_id,author_id,created_at').in('transaction_id', xIds).eq('is_internal', false).order('created_at', { ascending: false }))
    const seen = new Set()
    for (const r of await Promise.all(queries)) {
      for (const m of must(r)) {
        const k = m.ticket_id || m.transaction_id
        if (seen.has(k)) continue
        seen.add(k)
        if (m.author_id !== uid) awaiting += 1
      }
    }
  }
  const avg = fbs.length ? fbs.reduce((s, f) => s + f.rating, 0) / fbs.length : null
  return {
    open: open.length,
    awaiting,
    inReview: txns.filter((t) => !t.verdict).length,
    resolved: tickets.filter((t) => t.status === 'resolved').length + txns.filter((t) => t.verdict === 'safe' || t.verdict === 'suspicious').length,
    avgRating: avg,
    ratingCount: fbs.length,
  }
}

export async function getLatestTicket(uid) {
  const rows = must(
    await supabase.from('tickets').select(TICKET_SEL).eq('reporter_id', uid).neq('status', 'draft').order('created_at', { ascending: false }).limit(1),
  )
  const ticket = rows[0]
  if (!ticket) return null
  const [events, msgs] = await Promise.all([
    supabase.from('events').select(EVT_SEL).eq('ticket_id', ticket.id).order('created_at'),
    supabase.from('messages').select(MSG_SEL).eq('ticket_id', ticket.id).eq('is_internal', false).order('created_at', { ascending: false }),
  ])
  const lastStaff = must(msgs).find((m) => m.author?.role === 'admin') || null
  return { ticket, events: must(events), lastStaff }
}

export async function listMyItems(uid) {
  const [tk, tx] = await Promise.all([
    supabase.from('tickets').select(TICKET_SEL).eq('reporter_id', uid).neq('status', 'draft'),
    supabase.from('transactions').select(TXN_SEL).eq('submitter_id', uid),
  ])
  return [...must(tk).map(ticketRow), ...must(tx).map(txnRow)].sort(byDateDesc)
}

export async function getLatestDraft(uid) {
  const rows = must(await supabase.from('tickets').select('*').eq('reporter_id', uid).eq('status', 'draft').order('updated_at', { ascending: false }).limit(1))
  return rows[0] || null
}

export async function saveIncident(uid, draftId, form, files, asDraft) {
  const payload = {
    type: form.type, subject: form.subject.trim(), description: form.description.trim(),
    occurred_at: form.occurred_at ? new Date(form.occurred_at).toISOString() : null,
    severity: form.severity, status: asDraft ? 'draft' : 'new',
  }
  let ticket
  if (draftId) {
    ticket = must(await supabase.from('tickets').update(payload).eq('id', draftId).select().single())
  } else {
    ticket = must(await supabase.from('tickets').insert({ ...payload, reporter_id: uid }).select().single())
  }
  if (files.length) await uploadEvidence(uid, files, { ticket_id: ticket.id })
  return ticket
}

export async function createTransaction(uid, form, files) {
  const txn = must(
    await supabase.from('transactions').insert({
      submitter_id: uid, recipient_name: form.recipient_name.trim(), channel: form.channel.trim(),
      account_number: form.account_number.trim(), amount: Number(form.amount),
      request_source: form.request_source.trim() || null, notes: form.notes.trim() || null,
    }).select(TXN_SEL).single(),
  )
  if (files.length) await uploadEvidence(uid, files, { transaction_id: txn.id })
  return txn
}

export async function listMyTransactions(uid) {
  return must(await supabase.from('transactions').select(TXN_SEL).eq('submitter_id', uid).order('created_at', { ascending: false }))
}

export async function getItem(kind, id) {
  const isTicket = kind === 'ticket'
  const col = isTicket ? 'ticket_id' : 'transaction_id'
  const [item, msgs, evts, files] = await Promise.all([
    supabase.from(isTicket ? 'tickets' : 'transactions').select(isTicket ? TICKET_SEL : TXN_SEL).eq('id', id).single(),
    supabase.from('messages').select(MSG_SEL).eq(col, id).order('created_at'),
    supabase.from('events').select(EVT_SEL).eq(col, id).order('created_at'),
    supabase.from('attachments').select('*').eq(col, id).order('created_at'),
  ])
  return { item: must(item), messages: must(msgs), events: must(evts), files: must(files) }
}

export async function addMessage(uid, kind, id, body, internal = false) {
  must(await supabase.from('messages').insert({
    [kind === 'ticket' ? 'ticket_id' : 'transaction_id']: id, author_id: uid, body: body.trim(), is_internal: internal,
  }))
}

export async function listFeedbackable(uid) {
  const [tk, tx, fb] = await Promise.all([
    supabase.from('tickets').select('id,code,type,resolved_at').eq('reporter_id', uid).eq('status', 'resolved'),
    supabase.from('transactions').select('id,code,recipient_name,verdict_at,verdict').eq('submitter_id', uid).in('verdict', ['safe', 'suspicious']),
    supabase.from('feedback').select('ticket_id,transaction_id').eq('user_id', uid),
  ])
  const rated = new Set(must(fb).map((f) => f.ticket_id || f.transaction_id))
  return [
    ...must(tk).filter((t) => !rated.has(t.id)).map((t) => ({ kind: 'ticket', id: t.id, code: t.code, label: t.type, when: t.resolved_at })),
    ...must(tx).filter((t) => !rated.has(t.id)).map((t) => ({ kind: 'txn', id: t.id, code: t.code, label: 'Transaction Verification', when: t.verdict_at })),
  ]
}
export async function listMyFeedback(uid) {
  return must(await supabase.from('feedback').select('*, ticket:tickets(code), txn:transactions(code)').eq('user_id', uid).order('created_at', { ascending: false }))
}
export async function submitFeedback(uid, item, rating, comment) {
  must(await supabase.from('feedback').insert({
    user_id: uid, [item.kind === 'ticket' ? 'ticket_id' : 'transaction_id']: item.id, rating, comment: comment.trim() || null,
  }))
}

/* ---------- profile / settings (shared) ---------- */
export async function updateProfile(uid, patch) {
  return must(await supabase.from('profiles').update(patch).eq('id', uid).select().single())
}
export async function uploadAvatar(uid, file) {
  const ext = (file.name.split('.').pop() || 'png').toLowerCase()
  const path = `${uid}/avatar-${Date.now()}.${ext}`
  const up = await supabase.storage.from('avatars').upload(path, file, { upsert: true, contentType: file.type })
  if (up.error) throw up.error
  const { data } = supabase.storage.from('avatars').getPublicUrl(path)
  return updateProfile(uid, { avatar_url: data.publicUrl })
}
export async function changePassword(email, current, next) {
  const check = await supabase.auth.signInWithPassword({ email, password: current })
  if (check.error) throw new Error('Your current password is not correct.')
  const { error } = await supabase.auth.updateUser({ password: next })
  if (error) throw error
}

/* =====================================================================
   ADMIN SIDE
   ===================================================================== */
export async function listQueue() {
  const [tk, tx] = await Promise.all([
    supabase.from('tickets').select(TICKET_SEL).neq('status', 'draft').order('updated_at', { ascending: false }).limit(300),
    supabase.from('transactions').select(TXN_SEL).order('updated_at', { ascending: false }).limit(300),
  ])
  return [...must(tk).map(ticketRow), ...must(tx).map(txnRow)].sort(byDateDesc)
}

export async function listAdmins() {
  return must(await supabase.from('profiles').select('id,full_name,admin_title,avatar_url').eq('role', 'admin').order('full_name'))
}

export async function bulkAssign(rows, adminId) {
  const tIds = rows.filter((r) => r.kind === 'ticket').map((r) => r.id)
  const xIds = rows.filter((r) => r.kind === 'txn').map((r) => r.id)
  if (tIds.length) must(await supabase.from('tickets').update({ assigned_to: adminId }).in('id', tIds))
  if (xIds.length) must(await supabase.from('transactions').update({ assigned_to: adminId }).in('id', xIds))
}

export async function getOverview(days) {
  return must(await supabase.rpc('admin_overview', { p_days: days }))
}

export async function getAdminTicket(id) {
  const base = await getItem('ticket', id)
  const t = base.item
  const [reporterTickets, fb, similar] = await Promise.all([
    supabase.from('tickets').select('id,status').eq('reporter_id', t.reporter_id).neq('status', 'draft'),
    supabase.from('feedback').select('rating').eq('user_id', t.reporter_id),
    supabase.from('tickets').select(TICKET_SEL).neq('id', t.id).neq('status', 'draft').or(`type.eq."${t.type}",reporter_id.eq.${t.reporter_id}`).order('created_at', { ascending: false }).limit(2),
  ])
  const rt = must(reporterTickets), ratings = must(fb)
  return {
    ...base,
    requester: {
      total: rt.length,
      open: rt.filter((x) => x.status !== 'resolved').length,
      avg: ratings.length ? (ratings.reduce((s, f) => s + f.rating, 0) / ratings.length).toFixed(1) : '—',
    },
    similar: must(similar),
  }
}

export async function updateTicket(id, patch) {
  return must(await supabase.from('tickets').update(patch).eq('id', id).select().single())
}

export async function getAdminTransaction(id) {
  const base = await getItem('txn', id)
  const checklist = must(await supabase.from('checklist_items').select('*').order('sort'))
  return { ...base, checklistItems: checklist }
}
export async function updateTransaction(id, patch) {
  return must(await supabase.from('transactions').update(patch).eq('id', id).select().single())
}
export const requestCosign = async (id) => must(await supabase.rpc('request_cosign', { p_id: id }))
export const cosign = async (id) => must(await supabase.rpc('cosign_transaction', { p_id: id }))
export const issueVerdict = async (id, verdict, justification) =>
  must(await supabase.rpc('issue_verdict', { p_id: id, p_verdict: verdict, p_justification: justification }))

export async function getAdminSettings() {
  return must(await supabase.from('admin_settings').select('*').eq('id', 1).single())
}
export async function updateAdminSettings(patch) {
  return must(await supabase.from('admin_settings').update(patch).eq('id', 1).select().single())
}

// Re-authentication gate for sensitive actions (verdicts)
export async function reauthenticate(email, password) {
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw new Error('Password is not correct.')
}
