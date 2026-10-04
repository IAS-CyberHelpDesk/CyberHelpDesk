export const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: '2-digit' }) : '—')
export const fmtDateLong = (d) =>
  d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }) : '—'
export const fmtTime = (d) => (d ? new Date(d).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '')
export const fmtDateTime = (d) => (d ? `${fmtDate(d)} · ${fmtTime(d)}` : '—')
export const fmtDateTimeLong = (d) => (d ? `${fmtDateLong(d)} · ${fmtTime(d)}` : '—')

export const peso = (n) =>
  '₱ ' + Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const pesoShort = (n) => '₱ ' + Number(n || 0).toLocaleString('en-PH')

export const initials = (name) =>
  (name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0].toUpperCase())
    .join('')

export const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '')

export function fmtSize(bytes) {
  if (bytes == null) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

// Countdown to a deadline. Returns { overdue, label, ms }
export function remaining(due) {
  if (!due) return { overdue: false, label: '—', ms: 0 }
  const ms = new Date(due).getTime() - Date.now()
  const abs = Math.abs(ms)
  const h = Math.floor(abs / 3600000)
  const m = Math.floor((abs % 3600000) / 60000)
  const label = h >= 48 ? `${Math.floor(h / 24)}d ${h % 24}h` : h > 0 ? `${h}h ${m}m` : `${m}m`
  return { overdue: ms < 0, label, ms }
}

export function slaProgress(created, due) {
  const total = new Date(due) - new Date(created)
  if (!(total > 0)) return 0
  return Math.max(0, Math.min(1, (Date.now() - new Date(created)) / total))
}

// Status helpers: return { key, label } where key maps to a .b-<key> badge class
export function ticketStatus(status) {
  if (status === 'in_progress') return { key: 'in_progress', label: 'In Progress' }
  if (status === 'resolved') return { key: 'resolved', label: 'Resolved' }
  if (status === 'draft') return { key: 'draft', label: 'Draft' }
  return { key: 'new', label: 'New' }
}

export function txnStatus(t) {
  if (t.verdict === 'safe') return { key: 'safe', label: 'Verified Safe' }
  if (t.verdict === 'suspicious') return { key: 'flagged', label: 'Flagged' }
  if (t.verdict === 'needs_info') return { key: 'needs_info', label: 'Needs Info' }
  if (t.status === 'under_review') return { key: 'under_review', label: 'Under Review' }
  return { key: 'new', label: 'New' }
}

export const verdictLabel = (v) =>
  ({ safe: 'Verified Safe', suspicious: 'Flagged Suspicious', needs_info: 'Needs More Information' })[v] || 'Pending'

export function toCsv(rows) {
  const esc = (v) => {
    const s = v == null ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return rows.map((r) => r.map(esc).join(',')).join('\n')
}

export function download(filename, text, type = 'text/csv') {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
