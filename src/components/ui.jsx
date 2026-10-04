import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { Star, UploadCloud, X, FileText, Loader2 } from 'lucide-react'
import { initials, fmtSize } from '../lib/format'
import { ACCEPTED_FILES, MAX_FILE_BYTES } from '../lib/constants'

/* ---------- async data hook ---------- */
export function useAsync(fn, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, error: null })
  const run = useCallback(() => {
    let alive = true
    setState((s) => ({ ...s, loading: true, error: null }))
    fn()
      .then((data) => alive && setState({ data, loading: false, error: null }))
      .catch((error) => alive && setState({ data: null, loading: false, error }))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  useEffect(() => run(), [run])
  return { ...state, reload: run }
}

/* ---------- toasts ---------- */
const ToastCtx = createContext(() => {})
export const useToast = () => useContext(ToastCtx)
export function ToastProvider({ children }) {
  const [items, setItems] = useState([])
  const push = useCallback((message, type = 'ok') => {
    const id = Math.random()
    setItems((x) => [...x, { id, message, type }])
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 4200)
  }, [])
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.type}`}>{t.message}</div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}
export const errMsg = (e) => e?.message || 'Something went wrong. Please try again.'

/* ---------- small pieces ---------- */
export function Badge({ kind, children, dot }) {
  return (
    <span className={`badge b-${kind}`}>
      {dot && <i className="dot" />}
      {children}
    </span>
  )
}
export const PriorityBadge = ({ value }) => <Badge kind={value}>{value ? value[0].toUpperCase() + value.slice(1) : '—'}</Badge>

export function Avatar({ name, src, size = 36, tone = 'blue' }) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.38) }
  if (src) return <img className="avatar" style={style} src={src} alt="" />
  return <span className={`avatar ${tone}`} style={style}>{initials(name)}</span>
}

export function Toggle({ checked, onChange, label }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} className={`toggle ${checked ? 'on' : ''}`} onClick={() => onChange(!checked)}>
      <i />
    </button>
  )
}

export function Spinner({ label = 'Loading…' }) {
  return (
    <div className="center-note"><Loader2 className="spin" size={18} /> {label}</div>
  )
}
export function ErrorNote({ error, onRetry }) {
  return (
    <div className="notice red">
      <div>
        <b>We couldn’t load this.</b>
        <div>{errMsg(error)}</div>
        {onRetry && <button className="btn btn-outline sm mt8" onClick={onRetry}>Try again</button>}
      </div>
    </div>
  )
}
export function Empty({ title, children }) {
  return (
    <div className="empty">
      <b>{title}</b>
      {children && <div>{children}</div>}
    </div>
  )
}

export function Modal({ title, onClose, children, footer }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="row between">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  )
}

export function Stars({ value, onChange, size = 22 }) {
  return (
    <div className="stars" role="radiogroup" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button type="button" key={n} role="radio" aria-checked={value === n} aria-label={`${n} star${n > 1 ? 's' : ''}`} onClick={() => onChange?.(n)} disabled={!onChange}>
          <Star size={size} fill={n <= value ? '#F59E0B' : 'none'} color={n <= value ? '#F59E0B' : '#CBD5E1'} />
        </button>
      ))}
    </div>
  )
}

/* ---------- file picker ---------- */
export function DropZone({ files, setFiles, title = 'Drag & drop files here, or click to browse', hint = 'PNG, JPG, PDF up to 10MB', onError }) {
  const input = useRef(null)
  const [over, setOver] = useState(false)

  const add = (list) => {
    const next = []
    for (const f of Array.from(list)) {
      if (f.size > MAX_FILE_BYTES) {
        onError?.(`${f.name} is larger than 10MB.`)
        continue
      }
      next.push(f)
    }
    if (next.length) setFiles([...files, ...next])
  }

  return (
    <div>
      <div
        className={`dropzone ${over ? 'over' : ''}`}
        role="button"
        tabIndex={0}
        onClick={() => input.current?.click()}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true) }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); add(e.dataTransfer.files) }}
      >
        <UploadCloud size={22} color="#64748B" />
        <b>{title}</b>
        <span>{hint}</span>
        <input ref={input} type="file" multiple hidden accept={ACCEPTED_FILES} onChange={(e) => { add(e.target.files); e.target.value = '' }} />
      </div>
      {files.length > 0 && (
        <div className="chips-row mt8">
          {files.map((f, i) => (
            <span className="file-chip" key={i}>
              <FileText size={15} />
              <span>{f.name}</span>
              <em>{fmtSize(f.size)}</em>
              <button type="button" onClick={() => setFiles(files.filter((_, j) => j !== i))} aria-label={`Remove ${f.name}`}><X size={14} /></button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

export function FileTile({ file, onOpen }) {
  return (
    <button className="file-tile" onClick={() => onOpen(file)}>
      <span className="ft-icon"><FileText size={16} /></span>
      <span>
        <b>{file.file_name}</b>
        <em>{fmtSize(file.size_bytes)}</em>
      </span>
    </button>
  )
}

export const Field = ({ label, children, hint }) => (
  <label className="field">
    <span className="label">{label}</span>
    {children}
    {hint && <span className="hint">{hint}</span>}
  </label>
)

export function Segmented({ options, value, onChange }) {
  return (
    <div className="seg" role="tablist">
      {options.map((o) => (
        <button key={o.value} type="button" role="tab" aria-selected={value === o.value} className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}
