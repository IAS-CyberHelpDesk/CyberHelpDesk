import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { CHART_COLORS, CHART_SHORT, CHART_TYPES } from '../lib/constants'

export const bucketLabel = (iso, bucket) =>
  new Date(iso).toLocaleDateString('en-US', bucket === 'day' ? { month: 'short', day: 'numeric' } : { month: 'short' })

// overview.by_type → [{ label, Phishing: n, ... }]
export function typeSeries(overview) {
  const map = new Map()
  for (const r of overview.by_type || []) {
    const row = map.get(r.bucket) || { bucket: r.bucket, label: bucketLabel(r.bucket, overview.bucket), ...Object.fromEntries(CHART_TYPES.map((t) => [t, 0])) }
    if (CHART_TYPES.includes(r.type)) row[r.type] = r.count
    map.set(r.bucket, row)
  }
  return [...map.values()].sort((a, b) => new Date(a.bucket) - new Date(b.bucket))
}
export function volumeSeries(overview) {
  return (overview.volume || [])
    .map((r) => ({ bucket: r.bucket, label: bucketLabel(r.bucket, overview.bucket), Opened: r.opened, Resolved: r.resolved }))
    .sort((a, b) => new Date(a.bucket) - new Date(b.bucket))
}

const tip = { borderRadius: 10, border: '1px solid #E2E8F0', boxShadow: '0 8px 24px rgba(15,23,42,.08)', fontSize: 12 }

export function TypeChart({ data, height = 260 }) {
  if (!data.length) return <div className="empty"><b>No incidents in this period</b></div>
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
        <CartesianGrid stroke="#EEF2F6" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={tip} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} formatter={(v) => CHART_SHORT[v] || v} />
        {CHART_TYPES.map((t) => (
          <Line key={t} type="monotone" dataKey={t} name={t} stroke={CHART_COLORS[t]} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}

export function VolumeChart({ data, height = 240 }) {
  if (!data.length) return <div className="empty"><b>No activity in this period</b></div>
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
        <CartesianGrid stroke="#EEF2F6" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={tip} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
        <Line type="monotone" dataKey="Opened" stroke="#2563EB" strokeWidth={2} dot={{ r: 3 }} />
        <Line type="monotone" dataKey="Resolved" stroke="#16A34A" strokeWidth={2} dot={{ r: 3 }} />
      </LineChart>
    </ResponsiveContainer>
  )
}
