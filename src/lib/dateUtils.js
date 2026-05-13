const DEFAULT_TZ = 'Europe/Madrid'

export function fmtDatetime(ts, timezone = DEFAULT_TZ) {
  if (!ts) return '—'
  return new Date(ts).toLocaleString('es-ES', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    timeZone: timezone,
  })
}

export function fmtDate(ts, timezone = DEFAULT_TZ) {
  if (!ts) return '—'
  return new Date(ts).toLocaleDateString('es-ES', {
    day: 'numeric', month: 'short', year: 'numeric',
    timeZone: timezone,
  })
}
