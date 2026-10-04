import { useState } from 'react'
import { Download, Inbox, CheckCircle2, Clock, Star } from 'lucide-react'
import { Topbar } from '../../components/Layout'
import { TypeChart, VolumeChart, typeSeries, volumeSeries } from '../../components/Charts'
import { getOverview } from '../../lib/api'
import { ErrorNote, Segmented, Spinner, useAsync } from '../../components/ui'
import { download, toCsv } from '../../lib/format'
import { CHART_TYPES } from '../../lib/constants'

const RANGES = [{ value: 7, label: '7 days' }, { value: 30, label: '30 days' }, { value: 180, label: '6 months' }, { value: 365, label: '12 months' }]
const pct = (a, b) => (b ? Math.round(((a - b) / b) * 100) : null)

function Kpi({ icon, tone, pill, value, label }) {
  return (
    <div className="card stat">
      <div className="row between"><span className={`stat-icon ${tone}`}>{icon}</span><span className={`pill ${tone}`}>{pill}</span></div>
      <div className="num">{value}</div><div className="muted">{label}</div>
    </div>
  )
}

export default function Reports() {
  const [days, setDays] = useState(180)
  const { data: o, error, reload } = useAsync(() => getOverview(days), [days])

  const exportCsv = () => {
    const rangeLabel = RANGES.find((r) => r.value === days).label
    const trend = typeSeries(o)
    const vol = volumeSeries(o)
    const rows = [
      ['CyberHelpDesk report', rangeLabel], [],
      ['Total tickets', o.total], ['Resolved', o.resolved], ['Open', o.open],
      ['Avg resolution (days)', o.avg_resolution_days ?? ''], ['Avg rating', o.avg_rating ?? ''], ['Ratings', o.rating_count],
      ['Within SLA', o.sla_within], ['Breached SLA', o.sla_breached], [],
      ['Incident trends', ...CHART_TYPES], ...trend.map((r) => [r.label, ...CHART_TYPES.map((t) => r[t])]), [],
      ['Ticket volume', 'Opened', 'Resolved'], ...vol.map((r) => [r.label, r.Opened, r.Resolved]), [],
      ['Top admins', 'Resolved', 'Avg rating'], ...(o.top_admins || []).map((a) => [a.name, a.resolved, a.rating ?? '']),
    ]
    download(`cyberhelpdesk-report-${days}d.csv`, toCsv(rows))
  }

  const trend = o ? typeSeries(o) : []
  const last = trend[trend.length - 1], prev = trend[trend.length - 2]
  const phishDelta = last && prev ? pct(last.Phishing, prev.Phishing) : null
  const slaTotal = o ? o.sla_within + o.sla_breached : 0
  const within = slaTotal ? Math.round((o.sla_within / slaTotal) * 100) : 0
  const resRate = o && o.total ? Math.round((o.resolved / o.total) * 100) : 0
  const totalDelta = o ? pct(o.total, o.total_prev) : null
  const resDelta = o && o.avg_resolution_days != null && o.avg_resolution_days_prev != null ? +(o.avg_resolution_days - o.avg_resolution_days_prev).toFixed(1) : null
  const maxResolved = Math.max(1, ...(o?.top_admins || []).map((a) => a.resolved))

  return (
    <>
      <Topbar title="Reports & Analytics" />
      <div className="content">
        <div className="row between wrap gap12 no-print">
          <Segmented options={RANGES} value={days} onChange={setDays} />
          <div className="row gap8">
            <button className="btn btn-outline" disabled={!o} onClick={exportCsv}><Download size={15} /> Export CSV</button>
            <button className="btn btn-outline" onClick={() => window.print()}><Download size={15} /> Export PDF</button>
          </div>
        </div>

        {error ? <div className="mt16"><ErrorNote error={error} onRetry={reload} /></div> : !o ? <Spinner /> : (
          <>
            <div className="grid g4 mt16">
              <Kpi icon={<Inbox size={18} />} tone="blue" pill={totalDelta == null ? 'New' : `${totalDelta >= 0 ? '+' : ''}${totalDelta}% vs prior`} value={o.total} label="Total Tickets" />
              <Kpi icon={<CheckCircle2 size={18} />} tone="green" pill={`${resRate}% resolution rate`} value={o.resolved} label="Resolved" />
              <Kpi icon={<Clock size={18} />} tone="amber" pill={resDelta == null ? '—' : `${resDelta > 0 ? '+' : ''}${resDelta}d vs prior`} value={o.avg_resolution_days != null ? `${o.avg_resolution_days} days` : '—'} label="Avg. Resolution Time" />
              <Kpi icon={<Star size={18} />} tone="purple" pill={`From ${o.rating_count} responses`} value={o.avg_rating != null ? `${o.avg_rating} / 5` : '—'} label="User Satisfaction" />
            </div>

            <div className="card mt24">
              <div className="row between wrap gap8">
                <div><h2 className="h-md">Incident Trends by Type</h2><p className="small muted">Tickets per {o.bucket} · {RANGES.find((r) => r.value === days).label}</p></div>
                {phishDelta != null && <span className="pill blue">Phishing {phishDelta >= 0 ? 'up' : 'down'} {Math.abs(phishDelta)}% vs prior {o.bucket}</span>}
              </div>
              <TypeChart data={trend} height={280} />
            </div>

            <div className="split wide mt24">
              <div className="card">
                <h2 className="h-md">Ticket Volume</h2><p className="small muted">Opened vs resolved</p>
                <VolumeChart data={volumeSeries(o)} />
              </div>
              <div className="stack gap24">
                <div className="card">
                  <h2 className="h-md">Resolution SLA Compliance</h2>
                  <div className="meter"><div className="row between"><span>Within SLA</span><b>{slaTotal ? within : 0}%</b></div><div className="bar"><i style={{ width: `${within}%`, background: '#16A34A' }} /></div></div>
                  <div className="meter"><div className="row between"><span>Breached SLA</span><b>{slaTotal ? 100 - within : 0}%</b></div><div className="bar"><i style={{ width: `${slaTotal ? 100 - within : 0}%`, background: '#DC2626' }} /></div></div>
                  {!slaTotal && <p className="small muted">No resolved items in this period yet.</p>}
                </div>
                <div className="card">
                  <h2 className="h-md">Top Performing Admins</h2>
                  {(o.top_admins || []).length === 0 && <p className="small muted">No resolved items in this period yet.</p>}
                  {(o.top_admins || []).map((a) => (
                    <div className="meter" key={a.name}>
                      <div className="row between"><span>{a.name} · {a.resolved} resolved</span><b>{a.rating != null ? `${a.rating} ★` : '—'}</b></div>
                      <div className="bar"><i style={{ width: `${(a.resolved / maxResolved) * 100}%`, background: '#2563EB' }} /></div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  )
}
