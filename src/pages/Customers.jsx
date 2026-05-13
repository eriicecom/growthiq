import { useState, useEffect, useMemo } from 'react'
import {
  Users, UserPlus, UserCheck, TrendingUp, TrendingDown, Euro,
  ChevronDown, ChevronLeft, ChevronRight, Download, Search,
  Loader2, AlertCircle,
} from 'lucide-react'
import {
  ResponsiveContainer, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import { usePeriod, PERIODS } from '@/contexts/PeriodContext'
import { buildPeriodWindows } from '@/lib/periodUtils'
import { useCurrency, CURRENCIES } from '@/hooks/useCurrency'
import { useStoreSettings } from '@/contexts/StoreSettingsContext'
import { fmtDate as fmtDateUtil } from '@/lib/dateUtils'

// ── Constants ─────────────────────────────────────────────────────────────────
const MONTHS_ES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
const PAGE_SIZE = 20
const AVATAR_PALETTE = [
  'bg-brand-500/20 text-brand-400',
  'bg-emerald-500/20 text-emerald-400',
  'bg-violet-500/20 text-violet-400',
  'bg-amber-500/20 text-amber-400',
  'bg-pink-500/20 text-pink-400',
  'bg-blue-500/20 text-blue-400',
]

// ── Pure helpers ──────────────────────────────────────────────────────────────
function avatarColor(email = '') {
  let h = 0
  for (let i = 0; i < email.length; i++) h = (h + email.charCodeAt(i)) % AVATAR_PALETTE.length
  return AVATAR_PALETTE[h]
}

function Sk({ className }) {
  return <div className={`bg-white/5 rounded animate-pulse ${className}`} />
}

function calcPct(c, p) {
  if (p === 0) return 0
  return Math.round(((c - p) / p) * 100 * 10) / 10
}

function fmtMoney(v, symbol, convert) {
  const cv = convert(v)
  if (cv >= 1_000_000) return `${symbol}${(cv / 1_000_000).toFixed(1)}M`
  if (cv >= 1_000)     return `${symbol}${(cv / 1_000).toFixed(1)}k`
  return `${symbol}${cv.toFixed(2)}`
}

// fmtDate is imported from dateUtils; define a local alias used with explicit timezone
function fmtDate(ts, timezone) { return fmtDateUtil(ts, timezone) }

// ── Data processing ───────────────────────────────────────────────────────────
function processCustomers(allOrders, period) {
  const {
    windowStart, windowEnd,
    compareStart, compareEnd,
    numDays, chartEndDate, isSingleDay,
  } = buildPeriodWindows(period)

  const wIso = windowStart.toISOString()
  const wEnd = windowEnd.toISOString()
  const cIso = compareStart.toISOString()
  const cEnd = compareEnd.toISOString()

  // Build per-email customer map from ALL fetched orders
  const map = {}
  for (const o of allOrders) {
    const email = o.customer_email || 'desconocido'
    if (!map[email]) {
      map[email] = {
        email,
        name:         o.customer_name || 'Cliente desconocido',
        allOrders:    [],
        currOrders:   [],
        prevOrders:   [],
      }
    }
    map[email].allOrders.push(o)
    if (o.shopify_created_at >= wIso && o.shopify_created_at < wEnd)
      map[email].currOrders.push(o)
    if (o.shopify_created_at >= cIso && o.shopify_created_at < cEnd)
      map[email].prevOrders.push(o)
  }

  const customers = Object.values(map).map(c => {
    const isRecurring = c.allOrders.length >= 2
    const totalSpend  = c.allOrders.reduce((s, o) => s + (parseFloat(o.amount) || 0), 0)
    const currSpend   = c.currOrders.reduce((s, o) => s + (parseFloat(o.amount) || 0), 0)
    const prevSpend   = c.prevOrders.reduce((s, o) => s + (parseFloat(o.amount) || 0), 0)
    const sorted      = [...c.allOrders].sort((a, b) => a.shopify_created_at.localeCompare(b.shopify_created_at))
    return {
      email: c.email,
      name: c.name,
      isRecurring,
      totalOrders: c.allOrders.length,
      totalSpend,
      currSpend,
      prevSpend,
      currOrders: c.currOrders.length,
      prevOrders: c.prevOrders.length,
      firstOrder: sorted[0]?.shopify_created_at || '',
      lastOrder:  sorted[sorted.length - 1]?.shopify_created_at || '',
      ticketAvg:  c.allOrders.length ? totalSpend / c.allOrders.length : 0,
    }
  })

  const inCurr = customers.filter(c => c.currOrders > 0)
  const inPrev = customers.filter(c => c.prevOrders > 0)

  const cTotal = inCurr.length
  const cNew   = inCurr.filter(c => !c.isRecurring).length
  const cRecur = inCurr.filter(c =>  c.isRecurring).length
  const cRev   = inCurr.reduce((s, c) => s + c.currSpend, 0)
  const cAvg   = cTotal ? cRev / cTotal : 0

  // Previous: recompute on prevOrders
  const prevInPrev = customers.filter(c => c.prevOrders > 0)
  const pTotal = prevInPrev.length
  const pNew   = prevInPrev.filter(c => !c.isRecurring).length
  const pRecur = prevInPrev.filter(c =>  c.isRecurring).length
  const pRev   = prevInPrev.reduce((s, c) => s + c.prevSpend, 0)
  const pAvg   = pTotal ? pRev / pTotal : 0

  // ── Chart ─────────────────────────────────────────────────────────────────
  let chartData = []
  if (isSingleDay) {
    chartData = Array.from({ length: 24 }, (_, h) => ({
      date: `${String(h).padStart(2, '0')}h`,
      nuevos: 0,
      recurrentes: 0,
    }))
    // Deduplicate by customer per hour
    const seen = {}
    for (const o of allOrders) {
      if (o.shopify_created_at < wIso || o.shopify_created_at >= wEnd) continue
      const email = o.customer_email || 'desconocido'
      const h = new Date(o.shopify_created_at).getHours()
      const key = `${email}:${h}`
      if (seen[key]) continue
      seen[key] = true
      const c = map[email]
      if (!c) continue
      if (c.allOrders.length >= 2) chartData[h].recurrentes += 1
      else                         chartData[h].nuevos      += 1
    }
  } else {
    const base = new Date(chartEndDate); base.setHours(0, 0, 0, 0)
    for (let i = numDays - 1; i >= 0; i--) {
      const d = new Date(base); d.setDate(d.getDate() - i)
      chartData.push({
        k:    d.toISOString().slice(0, 10),
        date: `${MONTHS_ES[d.getMonth()]} ${d.getDate()}`,
        nuevos: 0,
        recurrentes: 0,
      })
    }
    const seenDay = {}
    for (const o of allOrders) {
      if (o.shopify_created_at < wIso || o.shopify_created_at >= wEnd) continue
      const email  = o.customer_email || 'desconocido'
      const dayKey = new Date(o.shopify_created_at).toISOString().slice(0, 10)
      const key    = `${email}:${dayKey}`
      if (seenDay[key]) continue
      seenDay[key] = true
      const row = chartData.find(r => r.k === dayKey)
      if (!row) continue
      const c = map[email]
      if (!c) continue
      if (c.allOrders.length >= 2) row.recurrentes += 1
      else                         row.nuevos      += 1
    }
    chartData = chartData.map(({ k, ...rest }) => rest)
  }

  const topCustomers = [...inCurr]
    .sort((a, b) => b.currSpend - a.currSpend)
    .slice(0, 10)

  return {
    kpis: {
      total:       { value: cTotal, change: calcPct(cTotal, pTotal) },
      nuevos:      { value: cNew,   change: calcPct(cNew,   pNew)   },
      recurrentes: { value: cRecur, change: calcPct(cRecur, pRecur) },
      avgValue:    { value: cAvg,   change: calcPct(cAvg,   pAvg)   },
    },
    chartData,
    topCustomers,
    allCustomers: customers.sort((a, b) => b.totalSpend - a.totalSpend),
    hasData: allOrders.length > 0,
  }
}

function exportCSV(customers, symbol, convert, timezone) {
  const hdrs = ['Nombre','Email','Pedidos','Total Gastado','Ticket Medio','Primera Compra','Última Compra','Tipo']
  const rows = customers.map(c => [
    c.name,
    c.email,
    c.totalOrders,
    convert(c.totalSpend).toFixed(2),
    convert(c.ticketAvg).toFixed(2),
    fmtDate(c.firstOrder, timezone),
    fmtDate(c.lastOrder, timezone),
    c.isRecurring ? 'Recurrente' : 'Nuevo',
  ])
  const csv = [hdrs, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = Object.assign(document.createElement('a'), { href: url, download: `clientes-${new Date().toISOString().slice(0,10)}.csv` })
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url)
}

// ── Sub-components ────────────────────────────────────────────────────────────
const KPI_COLORS = {
  brand:   'bg-brand-500/10   text-brand-400',
  emerald: 'bg-emerald-500/10 text-emerald-400',
  violet:  'bg-violet-500/10  text-violet-400',
  amber:   'bg-amber-500/10   text-amber-400',
}

function KPICard({ title, value, change, icon: Icon, color = 'brand', isMoney, symbol, convert, loading }) {
  const isGood = change >= 0
  const fmt = () => {
    if (isMoney) {
      const cv = convert(value)
      const d  = cv < 1000 ? 2 : 0
      return `${symbol}${new Intl.NumberFormat('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d }).format(cv)}`
    }
    return new Intl.NumberFormat('es-ES').format(value)
  }
  return (
    <div className="card p-5 flex flex-col gap-3 hover:border-white/10 transition-colors">
      <div className="flex items-start justify-between">
        <p className="text-sm text-white/50 font-medium leading-snug">{title}</p>
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${KPI_COLORS[color]}`}>
          <Icon size={18} />
        </div>
      </div>
      {loading ? (
        <div className="space-y-2"><Sk className="h-7 w-28" /><Sk className="h-3.5 w-20" /></div>
      ) : (
        <div>
          <p className="text-2xl font-semibold text-white tracking-tight">{fmt()}</p>
          <div className={`flex items-center gap-1 mt-1.5 text-xs font-medium ${isGood ? 'text-emerald-400' : 'text-red-400'}`}>
            {isGood ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            <span>{change >= 0 ? '+' : ''}{change}% vs período anterior</span>
          </div>
        </div>
      )}
    </div>
  )
}

function ChartTooltip({ active, payload, label, symbol, convert }) {
  if (!active || !payload?.length) return null
  const nuevos     = payload.find(p => p.dataKey === 'nuevos')?.value     ?? 0
  const recurrentes = payload.find(p => p.dataKey === 'recurrentes')?.value ?? 0
  return (
    <div className="bg-surface-700 border border-white/10 rounded-xl p-3 shadow-xl text-xs min-w-[150px]">
      <p className="text-white/60 mb-2 font-medium">{label}</p>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-brand-500" />
            <span className="text-white/60">Nuevos:</span>
          </div>
          <span className="text-white font-semibold">{nuevos}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-white/60">Recurrentes:</span>
          </div>
          <span className="text-white font-semibold">{recurrentes}</span>
        </div>
        <div className="flex items-center justify-between gap-4 border-t border-white/5 pt-1.5">
          <span className="text-white/40">Total:</span>
          <span className="text-white font-semibold">{nuevos + recurrentes}</span>
        </div>
      </div>
    </div>
  )
}

function CustomerAvatar({ name, email }) {
  const initial = (name || email || '?').charAt(0).toUpperCase()
  return (
    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${avatarColor(email)}`}>
      {initial}
    </div>
  )
}

function RecurringBadge({ isRecurring }) {
  return isRecurring
    ? <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">Recurrente</span>
    : <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white/5 text-white/30">Nuevo</span>
}

function TopCustomers({ customers, symbol, convert, loading }) {
  const { timezone } = useStoreSettings()
  const [showAll, setShowAll] = useState(false)
  const visible = showAll ? customers : customers.slice(0, 10)

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
        <div>
          <h3 className="text-sm font-semibold text-white">Top Clientes</h3>
          <p className="text-xs text-white/40 mt-0.5">Por total gastado en el período</p>
        </div>
        <Users size={15} className="text-white/30" />
      </div>

      {loading ? (
        <div className="p-5 space-y-3">{[1,2,3,4,5].map(i => <Sk key={i} className="h-10 w-full" />)}</div>
      ) : customers.length === 0 ? (
        <div className="flex items-center justify-center py-12 text-sm text-white/30">Sin clientes en el período</div>
      ) : (
        <>
          <div className="grid grid-cols-[1fr_80px_100px_96px] px-5 py-2.5 border-b border-white/5">
            {['Cliente', 'Pedidos', 'Gastado', 'Estado'].map(h => (
              <p key={h} className="text-[11px] font-semibold text-white/30 uppercase tracking-wide">{h}</p>
            ))}
          </div>
          {visible.map((c, i) => (
            <div key={c.email} className="grid grid-cols-[1fr_80px_100px_96px] px-5 py-3 border-b border-white/5 last:border-0 hover:bg-white/2 transition-colors items-center gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <CustomerAvatar name={c.name} email={c.email} />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-white truncate">{c.name}</p>
                  <p className="text-[10px] text-white/30 truncate">{c.email}</p>
                </div>
              </div>
              <p className="text-xs text-white/60">{c.currOrders}</p>
              <p className="text-xs font-semibold text-white">{fmtMoney(c.currSpend, symbol, convert)}</p>
              <RecurringBadge isRecurring={c.isRecurring} />
            </div>
          ))}
          {customers.length > 10 && (
            <button
              onClick={() => setShowAll(v => !v)}
              className="w-full py-3 text-xs text-brand-400/60 hover:text-brand-400 transition-colors border-t border-white/5"
            >
              {showAll ? 'Ver menos' : `Ver todos (${customers.length})`}
            </button>
          )}
        </>
      )}
    </div>
  )
}

function CustomerTable({ customers, symbol, convert, loading }) {
  const { timezone }          = useStoreSettings()
  const [search, setSearch]   = useState('')
  const [typeFilter, setType] = useState('Todos')
  const [page, setPage]       = useState(0)

  useEffect(() => { setPage(0) }, [search, typeFilter])

  const filtered = useMemo(() => {
    let list = customers
    if (typeFilter === 'Nuevos')      list = list.filter(c => !c.isRecurring)
    if (typeFilter === 'Recurrentes') list = list.filter(c =>  c.isRecurring)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(c => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q))
    }
    return list
  }, [customers, typeFilter, search])

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const pageRows   = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  return (
    <div className="card">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4 border-b border-white/5">
        <div>
          <h3 className="text-sm font-semibold text-white">Todos los Clientes</h3>
          <p className="text-xs text-white/40 mt-0.5">
            {loading ? 'Cargando...' : `${filtered.length} clientes`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Nombre o email…"
              className="bg-surface-700 border border-white/5 rounded-lg pl-7 pr-3 py-1.5 text-xs text-white/60 placeholder-white/20 focus:outline-none focus:border-white/10 transition-colors w-44"
            />
          </div>
          {/* Type filter */}
          <div className="relative">
            <select
              value={typeFilter}
              onChange={e => setType(e.target.value)}
              className="appearance-none bg-surface-700 border border-white/5 rounded-lg pl-3 pr-7 py-1.5 text-xs text-white/60 cursor-pointer hover:border-white/10 focus:outline-none transition-colors"
            >
              {['Todos','Nuevos','Recurrentes'].map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
          </div>
          {/* Export */}
          <button
            onClick={() => exportCSV(filtered, symbol, convert, timezone)}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-white/10 text-white/50 hover:text-white hover:border-white/20 transition-colors"
          >
            <Download size={13} /> CSV
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 size={20} className="animate-spin text-brand-400" /></div>
      ) : filtered.length === 0 ? (
        <div className="flex items-center justify-center py-12 text-sm text-white/30">Sin resultados</div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/5">
                  {['Cliente','Email','Pedidos','Total Gastado','Ticket Medio','Primera Compra','Última Compra'].map(h => (
                    <th key={h} className="px-5 py-3 text-left text-[11px] font-semibold text-white/30 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageRows.map(c => (
                  <tr key={c.email} className="border-b border-white/5 last:border-0 hover:bg-white/2 transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <CustomerAvatar name={c.name} email={c.email} />
                        <div>
                          <p className="text-xs font-medium text-white whitespace-nowrap">{c.name}</p>
                          <RecurringBadge isRecurring={c.isRecurring} />
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-xs text-white/40 max-w-[160px] truncate">{c.email}</td>
                    <td className="px-5 py-3.5 text-xs text-white/60 text-center">{c.totalOrders}</td>
                    <td className="px-5 py-3.5 text-xs font-semibold text-white whitespace-nowrap">{fmtMoney(c.totalSpend, symbol, convert)}</td>
                    <td className="px-5 py-3.5 text-xs text-white/50 whitespace-nowrap">{fmtMoney(c.ticketAvg, symbol, convert)}</td>
                    <td className="px-5 py-3.5 text-xs text-white/40 whitespace-nowrap">{fmtDate(c.firstOrder, timezone)}</td>
                    <td className="px-5 py-3.5 text-xs text-white/40 whitespace-nowrap">{fmtDate(c.lastOrder, timezone)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-white/5">
              <p className="text-xs text-white/30">
                {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} de {filtered.length}
              </p>
              <div className="flex items-center gap-1">
                <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                  className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/5 disabled:opacity-30 transition-colors">
                  <ChevronLeft size={15} />
                </button>
                {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                  const pg = Math.max(0, Math.min(page - 2, totalPages - 5)) + i
                  return (
                    <button key={pg} onClick={() => setPage(pg)}
                      className={`w-7 h-7 rounded-lg text-xs transition-colors ${pg === page ? 'bg-brand-500/20 text-brand-400 font-semibold' : 'text-white/40 hover:text-white hover:bg-white/5'}`}>
                      {pg + 1}
                    </button>
                  )
                })}
                <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
                  className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/5 disabled:opacity-30 transition-colors">
                  <ChevronRight size={15} />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function PageSkeleton() {
  return (
    <div className="space-y-6 max-w-screen-xl mx-auto">
      <div className="flex justify-between items-center">
        <div className="space-y-1.5"><Sk className="h-5 w-40" /><Sk className="h-3 w-28" /></div>
        <div className="flex gap-2"><Sk className="h-8 w-32" /><Sk className="h-8 w-24" /></div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {[1,2,3,4].map(i => <div key={i} className="card p-5 space-y-3"><Sk className="h-4 w-24" /><Sk className="h-8 w-32" /><Sk className="h-3 w-20" /></div>)}
      </div>
      <div className="card p-5 space-y-4"><Sk className="h-4 w-48" /><Sk className="h-[260px] w-full" /></div>
      <div className="card p-5 space-y-3"><Sk className="h-4 w-32" /><Sk className="h-[300px] w-full" /></div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Customers() {
  const { days, setDays }                          = usePeriod()
  const { symbol, convert, currency, setCurrency } = useCurrency()
  const [data, setData]                            = useState(null)
  const [loading, setLoading]                      = useState(true)

  useEffect(() => {
    if (!isSupabaseConfigured) { setLoading(false); return }
    setLoading(true)

    const { compareStart } = buildPeriodWindows(days)

    supabase
      .from('shopify_orders')
      .select('shopify_id, customer_email, customer_name, amount, shopify_created_at, financial_status')
      .gte('shopify_created_at', compareStart.toISOString())
      .order('shopify_created_at', { ascending: false })
      .then(({ data: orders }) => {
        const safe = orders || []
        setData(safe.length ? processCustomers(safe, days) : null)
        setLoading(false)
      })
  }, [days])

  const kpiPeriod = PERIODS.find(p => p.value === String(days))?.label ?? `${days} días`

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

  if (loading) return <PageSkeleton />

  if (!data) {
    return (
      <div className="max-w-screen-xl mx-auto flex items-center justify-center min-h-[60vh]">
        <div className="card p-12 text-center space-y-4 max-w-sm w-full">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto">
            <Users size={24} className="text-amber-400" />
          </div>
          <p className="text-base font-semibold text-white">Sin datos de clientes</p>
          <p className="text-sm text-white/40 leading-relaxed">
            Conecta tu tienda Shopify y sincroniza los pedidos para ver el análisis de clientes.
          </p>
        </div>
      </div>
    )
  }

  const { kpis, chartData, topCustomers, allCustomers } = data
  const isHourly  = chartData.length === 24 && String(chartData[0]?.date).endsWith('h')
  const xInterval = isHourly ? 5 : (Number(days) <= 7 ? 0 : Number(days) <= 14 ? 1 : Number(days) <= 30 ? 3 : 9)

  const maxY = chartData.reduce((m, d) => Math.max(m, (d.nuevos ?? 0) + (d.recurrentes ?? 0)), 0)
  const yTickFmt = v => Math.round(v) === v ? String(v) : ''

  return (
    <div className="space-y-6 max-w-screen-xl mx-auto">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-white">Análisis de Clientes</h2>
          <p className="text-xs text-white/40 mt-0.5">{kpiPeriod} · Shopify</p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <div className="relative">
            <select value={days} onChange={e => setDays(e.target.value)}
              className="appearance-none bg-surface-700 border border-white/5 rounded-lg pl-3 pr-7 py-1.5 text-xs text-white/60 cursor-pointer hover:border-white/10 focus:outline-none transition-colors">
              {PERIODS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
            <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
          </div>
          <div className="relative">
            <select value={currency} onChange={e => setCurrency(e.target.value)}
              className="appearance-none bg-surface-700 border border-white/5 rounded-lg pl-3 pr-7 py-1.5 text-xs text-white/60 cursor-pointer hover:border-white/10 focus:outline-none transition-colors">
              {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
            </select>
            <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* ── KPIs ───────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KPICard title="Total Clientes"        value={kpis.total.value}       change={kpis.total.change}       icon={Users}      color="brand"   symbol={symbol} convert={convert} />
        <KPICard title="Clientes Nuevos"       value={kpis.nuevos.value}      change={kpis.nuevos.change}      icon={UserPlus}   color="violet"  symbol={symbol} convert={convert} />
        <KPICard title="Clientes Recurrentes"  value={kpis.recurrentes.value} change={kpis.recurrentes.change} icon={UserCheck}  color="emerald" symbol={symbol} convert={convert} />
        <KPICard title="Valor Medio / Cliente" value={kpis.avgValue.value}    change={kpis.avgValue.change}    icon={Euro}       color="amber"   isMoney symbol={symbol} convert={convert} />
      </div>

      {/* ── Chart ──────────────────────────────────────────────────────────── */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-sm font-semibold text-white">Nuevos vs Recurrentes</h3>
            <p className="text-xs text-white/40 mt-0.5">{kpiPeriod}</p>
          </div>
          <div className="flex gap-3">
            {[
              { color: 'bg-brand-500',   label: 'Nuevos'      },
              { color: 'bg-emerald-500', label: 'Recurrentes' },
            ].map(({ color, label }) => (
              <div key={label} className="flex items-center gap-1.5 text-xs text-white/50">
                <span className={`w-2.5 h-2.5 rounded-full ${color}`} />
                {label}
              </div>
            ))}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barSize={isHourly ? 8 : undefined}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
            <XAxis dataKey="date" tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 11 }}
              axisLine={false} tickLine={false} interval={xInterval} />
            <YAxis tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 11 }}
              axisLine={false} tickLine={false} tickFormatter={yTickFmt}
              allowDecimals={false} width={32} />
            <Tooltip content={<ChartTooltip symbol={symbol} convert={convert} />}
              cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
            <Bar dataKey="nuevos"      name="Nuevos"      stackId="a" fill="#4f6ef7" radius={[0,0,0,0]} />
            <Bar dataKey="recurrentes" name="Recurrentes" stackId="a" fill="#10b981" radius={[4,4,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* ── Top Customers ──────────────────────────────────────────────────── */}
      <TopCustomers customers={topCustomers} symbol={symbol} convert={convert} loading={false} />

      {/* ── Full table ─────────────────────────────────────────────────────── */}
      <CustomerTable customers={allCustomers} symbol={symbol} convert={convert} loading={false} />

    </div>
  )
}
