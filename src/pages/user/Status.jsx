import { Link } from 'react-router-dom'
import { Inbox, Clock, CheckCircle2, Star, MessageSquare, ArrowRight, Check } from 'lucide-react'
import { Topbar } from '../../components/Layout'
import { useAuth } from '../../lib/AuthContext'
import { getLatestTicket, getMyStats } from '../../lib/api'
import { Badge, Empty, ErrorNote, PriorityBadge, Spinner, useAsync } from '../../components/ui'
import { fmtDateTime, remaining, ticketStatus } from '../../lib/format'

function StatCard({ icon, tone, pill, value, label }) {
  return (
    <div className="card stat">
      <div className="row between">
        <span className={`stat-icon ${tone}`}>{icon}</span>
        <span className={`pill ${tone}`}>{pill}</span>
      </div>
      <div className="num">{value}</div>
      <div className="muted">{label}</div>
    </div>
  )
}

export default function Status() {
  const { profile } = useAuth()
  const { data, loading, error, reload } = useAsync(async () => {
    const [stats, latest] = await Promise.all([getMyStats(profile.id), getLatestTicket(profile.id)])
    return { stats, latest }
  }, [profile.id])

  if (loading && !data) return <><Topbar title="Status" /><div className="content"><Spinner /></div></>
  if (error) return <><Topbar title="Status" /><div className="content"><ErrorNote error={error} onRetry={reload} /></div></>

  const { stats, latest } = data
  const t = latest?.ticket
  const assignedEvt = latest?.events.find((e) => e.kind === 'assigned')
  const st = t ? ticketStatus(t.status) : null
  const steps = t
    ? [
        { label: 'Submitted', sub: fmtDateTime(t.created_at), state: 'done' },
        { label: t.assignee ? `Assigned to ${t.assignee.full_name}` : 'Assignment', sub: t.assignee ? fmtDateTime(assignedEvt?.created_at || t.created_at) : 'Waiting for an admin', state: t.assignee ? 'done' : 'pending' },
        { label: 'In Progress', sub: t.status === 'in_progress' ? 'Currently being investigated' : t.status === 'resolved' ? 'Completed' : 'Pending', state: t.status === 'in_progress' ? 'active' : t.status === 'resolved' ? 'done' : 'pending' },
        { label: 'Resolved', sub: t.status === 'resolved' ? fmtDateTime(t.resolved_at) : 'Pending', state: t.status === 'resolved' ? 'done' : 'pending' },
      ]
    : []
  const due = t && t.status !== 'resolved' ? remaining(t.due_at) : null

  return (
    <>
      <Topbar title="Status" />
      <div className="content">
        <p className="page-sub">Here’s where your reports and verification requests stand today.</p>

        <div className="grid g4">
          <StatCard icon={<Inbox size={18} />} tone="blue" pill={`${stats.awaiting} awaiting your reply`} value={stats.open} label="Open Tickets" />
          <StatCard icon={<Clock size={18} />} tone="amber" pill="Est. 2–4 hrs" value={stats.inReview} label="In Review" />
          <StatCard icon={<CheckCircle2 size={18} />} tone="green" pill="All-time" value={stats.resolved} label="Resolved" />
          <StatCard icon={<Star size={18} />} tone="purple" pill={`From ${stats.ratingCount} review${stats.ratingCount === 1 ? '' : 's'}`} value={stats.avgRating ? `${stats.avgRating.toFixed(1)}/5` : '—'} label="Avg. Rating Given" />
        </div>

        {!t ? (
          <div className="card mt24">
            <Empty title="No reports yet">When something looks suspicious, <Link className="link" to="/report">report an incident</Link> or <Link className="link" to="/verify">verify a transaction</Link> before you pay.</Empty>
          </div>
        ) : (
          <div className="card mt24">
            <div className="row between wrap gap12">
              <div>
                <div className="eyebrow">Latest ticket</div>
                <h2 className="h-lg">{t.code} · {t.subject}</h2>
              </div>
              <div className="row gap8">
                <PriorityBadge value={t.priority} />
                <Badge kind={st.key} dot>{st.label}</Badge>
              </div>
            </div>

            <ol className="steps">
              {steps.map((s, i) => (
                <li key={i} className={s.state}>
                  <span className="step-dot">{s.state === 'done' ? <Check size={14} /> : s.state === 'active' ? <i /> : <i className="faint" />}</span>
                  <div><b>{s.label}</b><span>{s.sub}</span></div>
                </li>
              ))}
            </ol>

            <div className="notice blue between">
              <div className="row gap12">
                <span className="stat-icon solid"><MessageSquare size={16} /></span>
                <div>
                  <b>{latest.lastStaff ? `Latest update from ${latest.lastStaff.author.full_name}` : 'Your report is in the queue'}</b>
                  <div>{latest.lastStaff ? latest.lastStaff.body : 'A member of the team will pick this up shortly. You’ll see updates here and by email.'}</div>
                </div>
              </div>
              {due && (
                <div className="right small">
                  <div>Target resolution</div>
                  <b className="h-md">{due.overdue ? 'Overdue' : `in ${due.label}`}</b>
                </div>
              )}
            </div>

            <div className="row gap8 mt16">
              <Link className="btn btn-primary" to={`/tickets/ticket/${t.id}`}>View ticket details <ArrowRight size={15} /></Link>
              <Link className="btn btn-outline" to={`/tickets/ticket/${t.id}`} state={{ focusReply: true }}>Add a reply</Link>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
