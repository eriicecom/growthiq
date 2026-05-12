import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { RefreshCw, Loader2, Settings, AlertCircle, TrendingUp } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import { useCurrency } from '@/hooks/useCurrency'

const META_BLUE = '#1877F2'

function MetaIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={META_BLUE}>
      <path d="M12 2.04c-5.5 0-10 4.49-10 10.02 0 5 3.66 9.15 8.44 9.9v-7H7.9v-2.9h2.54V9.85c0-2.51 1.49-3.89 3.78-3.89 1.09 0 2.23.19 2.23.19v2.47h-1.26c-1.24 0-1.63.77-1.63 1.56v1.88h2.78l-.45 2.9h-2.33v7a10 10 0 0 0 8.44-9.9c0-5.53-4.5-10.02-10-10.02z" />
    </svg>
  )
}

function fmt(value, symbol) {
  if (value >= 1000) return `${symbol}${(value / 1000).toFixed(1)}k`
  return `${symbol}${value.toFixed(2)}`
}

function fmtNum(n) {
  return new Intl.NumberFormat('es-ES').format(n)
}

function SummaryCard({ label, value, symbol }) {
  return (
    <div className="card p-5 space-y-1.5">
      <p className="text-xs text-white/50 font-medium">{label}</p>
      <p className="text-2xl font-semibold text-white tracking-tight">{fmt(value, symbol)}</p>
    </div>
  )
}

export default function MetaAds() {
  const { symbol, convert } = useCurrency()
  const [connection, setConnection] = useState(undefined) // undefined=loading
  const [rows, setRows]             = useState([])
  const [loading, setLoading]       = useState(true)
  const [syncing, setSyncing]       = useState(false)
  const [syncError, setSyncError]   = useState('')

  const loadData = useCallback(async () => {
    if (!isSupabaseConfigured) { setLoading(false); return }

    const [{ data: conn }, { data: spend }] = await Promise.all([
      supabase
        .from('meta_connections')
        .select('ad_account_id, account_name, last_synced_at')
        .eq('is_active', true)
        .maybeSingle(),
      supabase
        .from('meta_ad_spend')
        .select('date, spend, impressions, clicks')
        .order('date', { ascending: false })
        .limit(30),
    ])

    setConnection(conn || null)
    setRows(spend || [])
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  async function handleSync() {
    setSyncing(true)
    setSyncError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/.netlify/functions/meta-sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || `Error ${res.status}`)
      await loadData()
    } catch (err) {
      setSyncError(err.message)
    } finally {
      setSyncing(false)
    }
  }

  // ── Derived stats ─────────────────────────────────────────────────────────
  const today      = new Date().toISOString().slice(0, 10)
  const d7         = new Date(); d7.setDate(d7.getDate() - 6); const d7str = d7.toISOString().slice(0, 10)

  const todayRow   = rows.find((r) => r.date === today)
  const todaySpend = convert(parseFloat(todayRow?.spend) || 0)
  const spend7d    = convert(rows.filter((r) => r.date >= d7str).reduce((s, r) => s + (parseFloat(r.spend) || 0), 0))
  const spend30d   = convert(rows.reduce((s, r) => s + (parseFloat(r.spend) || 0), 0))

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="max-w-screen-xl mx-auto space-y-6">
        <div className="h-5 w-40 bg-white/5 rounded animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card p-5 space-y-2 animate-pulse">
              <div className="h-3 w-20 bg-white/5 rounded" />
              <div className="h-7 w-28 bg-white/5 rounded" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ── Not configured ────────────────────────────────────────────────────────
  if (!isSupabaseConfigured) {
    return (
      <div className="max-w-screen-xl mx-auto flex items-center justify-center min-h-[60vh]">
        <div className="card p-10 text-center space-y-3 max-w-sm w-full">
          <AlertCircle size={28} className="mx-auto text-amber-400" />
          <p className="text-sm font-semibold text-white">Supabase no configurado</p>
        </div>
      </div>
    )
  }

  // ── Not connected ─────────────────────────────────────────────────────────
  if (!connection) {
    return (
      <div className="max-w-screen-xl mx-auto flex items-center justify-center min-h-[60vh]">
        <div className="card p-12 text-center space-y-6 max-w-md w-full">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto"
            style={{ background: `${META_BLUE}20` }}
          >
            <MetaIcon size={28} />
          </div>
          <div>
            <p className="text-base font-semibold text-white">Conecta tu cuenta de Meta Ads</p>
            <p className="text-sm text-white/40 mt-2 leading-relaxed">
              Para ver el gasto en Facebook e Instagram Ads, conecta tu cuenta en Configuración.
            </p>
          </div>
          <Link
            to="/settings"
            className="inline-flex items-center justify-center gap-2 btn-primary px-5 py-2.5 text-sm"
          >
            <Settings size={15} /> Ir a Configuración
          </Link>
        </div>
      </div>
    )
  }

  // ── Connected ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 max-w-screen-xl mx-auto">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${META_BLUE}20` }}>
            <MetaIcon size={16} />
          </div>
          <div>
            <h2 className="text-base font-semibold text-white">
              {connection.account_name || 'Meta Ads'}
            </h2>
            <p className="text-xs text-white/40 mt-0.5 font-mono">{connection.ad_account_id}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-white/10 text-white/50 hover:text-white hover:border-white/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {syncing
              ? <><Loader2 size={13} className="animate-spin" /> Sincronizando...</>
              : <><RefreshCw size={13} /> Sincronizar</>}
          </button>
        </div>
      </div>

      {syncError && (
        <div className="flex items-start gap-2.5 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
          <AlertCircle size={15} className="text-red-400 shrink-0 mt-0.5" />
          <p className="text-sm text-red-300">{syncError}</p>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SummaryCard label="Hoy"           value={todaySpend} symbol={symbol} />
        <SummaryCard label="Últimos 7 días"  value={spend7d}   symbol={symbol} />
        <SummaryCard label="Últimos 30 días" value={spend30d}  symbol={symbol} />
      </div>

      {/* Daily table */}
      <div className="card overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-white/5">
          <TrendingUp size={15} className="text-white/40" />
          <h3 className="text-sm font-semibold text-white">Gasto Diario</h3>
        </div>

        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 space-y-3">
            <MetaIcon size={28} />
            <p className="text-sm text-white/40">No hay datos de gasto. Pulsa Sincronizar para importarlos.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/5">
                  {['Fecha', 'Gasto', 'Impresiones', 'Clics', 'CPM', 'CPC'].map((h) => (
                    <th key={h} className="px-5 py-3 text-left font-medium text-white/40">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const spend = parseFloat(row.spend) || 0
                  const impr  = parseInt(row.impressions, 10) || 0
                  const clks  = parseInt(row.clicks, 10) || 0
                  const cpm   = impr > 0 ? convert(spend / impr * 1000) : 0
                  const cpc   = clks > 0 ? convert(spend / clks) : 0
                  const cSpend = convert(spend)

                  const [year, month, day] = row.date.split('-')
                  const dateLabel = new Date(Number(year), Number(month) - 1, Number(day))
                    .toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })

                  return (
                    <tr key={row.date} className="border-b border-white/5 hover:bg-white/2 transition-colors">
                      <td className="px-5 py-3 text-white/70 font-medium">{dateLabel}</td>
                      <td className="px-5 py-3 text-white font-semibold">{symbol}{cSpend.toFixed(2)}</td>
                      <td className="px-5 py-3 text-white/60">{fmtNum(impr)}</td>
                      <td className="px-5 py-3 text-white/60">{fmtNum(clks)}</td>
                      <td className="px-5 py-3 text-white/60">{impr > 0 ? `${symbol}${cpm.toFixed(2)}` : '—'}</td>
                      <td className="px-5 py-3 text-white/60">{clks > 0 ? `${symbol}${cpc.toFixed(2)}` : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {connection.last_synced_at && (
        <p className="text-xs text-white/25 text-right">
          Última sincronización:{' '}
          {new Date(connection.last_synced_at).toLocaleString('es-ES', {
            day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
          })}
        </p>
      )}
    </div>
  )
}
