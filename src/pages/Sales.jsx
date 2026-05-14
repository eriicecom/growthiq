import { useState, useEffect, useMemo } from 'react'
import {
  TrendingUp, TrendingDown, Euro, ShoppingBag, Target, Package,
  CheckCircle2, Clock, XCircle, RotateCcw,
  Download, ChevronLeft, ChevronRight, ChevronDown, ChevronUp,
  Loader2, AlertCircle, Percent, ArrowDownCircle, Ban, CreditCard,
  BarChart2, Tag,
} from 'lucide-react'
import {
  ResponsiveContainer, ComposedChart, Area, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import { usePeriod, PERIODS } from '@/contexts/PeriodContext'
import { buildPeriodWindows } from '@/lib/periodUtils'
import { useCurrency, CURRENCIES } from '@/hooks/useCurrency'
import { useStoreSettings } from '@/contexts/StoreSettingsContext'
import { fmtDatetime, fmtDate as fmtDateUtil } from '@/lib/dateUtils'
import Badge from '@/components/ui/Badge'

// ── Constants ─────────────────────────────────────────────────────────────────
const MONTHS_ES    = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
const PAGE_SIZE    = 20
const STATUS_OPTS  = ['Todos','Entregado','Procesando','En tránsito','Pendiente','Cancelado','Reembolsado']

const FUNNEL_ITEMS = [
  { key: 'completados',  label: 'Completados',  bar: 'bg-emerald-500/70', text: 'text-emerald-400', icon: CheckCircle2 },
  { key: 'pendientes',   label: 'Pendientes',   bar: 'bg-amber-500/70',   text: 'text-amber-400',   icon: Clock        },
  { key: 'cancelados',   label: 'Cancelados',   bar: 'bg-red-500/70',     text: 'text-red-400',     icon: XCircle      },
  { key: 'reembolsados', label: 'Reembolsados', bar: 'bg-orange-500/70',  text: 'text-orange-400',  icon: RotateCcw    },
]

const STATUS_BADGE = {
  'Entregado':   'success',
  'En tránsito': 'info',
  'Procesando':  'warning',
  'Pendiente':   'warning',
  'Cancelado':   'danger',
  'Reembolsado': 'danger',
}

const CHANNEL_CLS = {
  'Meta Ads':   'bg-blue-500/10  text-blue-400',
  'TikTok Ads': 'bg-pink-500/10  text-pink-400',
  'Orgánico':   'bg-emerald-500/10 text-emerald-400',
  'Email':      'bg-violet-500/10 text-violet-400',
  'Google Ads': 'bg-amber-500/10 text-amber-400',
}

const CHART_MODES = [
  { key: 'ventas',  label: 'Ingresos',     color: '#4f6ef7', isMoney: true  },
  { key: 'pedidos', label: 'Pedidos',       color: '#8b5cf6', isMoney: false },
  { key: 'ticket',  label: 'Ticket Medio',  color: '#10b981', isMoney: true  },
]

// ── Pure helpers ──────────────────────────────────────────────────────────────
function fmtMoney(v, symbol, convert) {
  const cv = convert(v)
  if (cv >= 1_000_000) return `${symbol}${(cv / 1_000_000).toFixed(1)}M`
  if (cv >= 1_000)     return `${symbol}${(cv / 1_000).toFixed(1)}k`
  return `${symbol}${cv.toFixed(2)}`
}

function calcPct(c, p) {
  if (p === 0) return 0
  return Math.round(((c - p) / p) * 100 * 10) / 10
}

function resolveStatus(o) {
  const fs = o.financial_status, fu = o.fulfillment_status
  if (fs === 'refunded' || fs === 'partially_refunded') return 'Reembolsado'
  if (fs === 'voided')         return 'Cancelado'
  if (fu === 'fulfilled')      return 'Entregado'
  if (fu === 'partial')        return 'En tránsito'
  if (fs === 'paid')           return 'Procesando'
  return 'Pendiente'
}

function resolveChannel(o) {
  const src = (o.source_name || '').toLowerCase()
  if (src.includes('facebook') || src.includes('meta')) return 'Meta Ads'
  if (src.includes('tiktok'))  return 'TikTok Ads'
  if (src.includes('google'))  return 'Google Ads'
  if (src === 'email')         return 'Email'
  return 'Orgánico'
}

function processOrders(allOrders, period) {
  const {
    windowStart, windowEnd,
    compareStart, compareEnd,
    numDays, chartEndDate,
  } = buildPeriodWindows(period)

  // For single-day periods ('today'/'yesterday'), previous period is 7 days prior (same weekday).
  // For regular periods, it's shifted by numDays.
  const prevOffset = (period === 'today' || period === 'yesterday') ? 7 : numDays

  const wIso = windowStart.toISOString()
  const wEnd = windowEnd.toISOString()
  const cIso = compareStart.toISOString()
  const cEnd = compareEnd.toISOString()

  const curr = allOrders.filter(o => o.shopify_created_at >= wIso && o.shopify_created_at < wEnd)
  const prev = allOrders.filter(o => o.shopify_created_at >= cIso && o.shopify_created_at < cEnd)

  const isRef     = o => o.financial_status === 'refunded' || o.financial_status === 'partially_refunded'
  const isVoid    = o => o.financial_status === 'voided'
  // Completado: paid AND fully fulfilled
  const isDone    = o => o.financial_status === 'paid' && o.fulfillment_status === 'fulfilled'
  // Pendiente: paid but not yet fulfilled (null / unfulfilled / partial)
  const isPending = o => o.financial_status === 'paid' &&
    (o.fulfillment_status === null || o.fulfillment_status === 'unfulfilled' || o.fulfillment_status === 'partial')
  const livRev    = arr => arr.filter(o => !isRef(o) && !isVoid(o)).reduce((s, o) => s + (parseFloat(o.amount) || 0), 0)

  const cRev  = livRev(curr),        pRev  = livRev(prev)
  const cCnt  = curr.length,         pCnt  = prev.length
  const cDone = curr.filter(isDone).length, pDone = prev.filter(isDone).length
  const cTkt  = cCnt  ? cRev  / cCnt  : 0,  pTkt = pCnt  ? pRev  / pCnt  : 0
  const cConv = cCnt  ? (cDone / cCnt) * 100 : 0
  const pConv = pCnt  ? (pDone / pCnt) * 100 : 0

  // ── Chart: hourly (single-day) or daily ─────────────────────────────────
  let chartData = []
  if (numDays === 1) {
    chartData = Array.from({ length: 24 }, (_, h) => ({
      date: `${String(h).padStart(2, '0')}h`,
      ventas: 0, pedidos: 0, ticket: 0, _n: 0,
      ventas_prev: 0, pedidos_prev: 0, ticket_prev: 0, _pn: 0,
    }))
    for (const o of curr) {
      if (isRef(o) || isVoid(o)) continue
      const h = new Date(o.shopify_created_at).getHours()
      const a = parseFloat(o.amount) || 0
      chartData[h].ventas += a; chartData[h].pedidos += 1; chartData[h]._n += 1
    }
    for (const o of prev) {
      if (isRef(o) || isVoid(o)) continue
      const h = new Date(o.shopify_created_at).getHours()
      const a = parseFloat(o.amount) || 0
      chartData[h].ventas_prev += a; chartData[h].pedidos_prev += 1; chartData[h]._pn += 1
    }
  } else {
    const base = new Date(chartEndDate); base.setHours(0, 0, 0, 0)
    for (let i = numDays - 1; i >= 0; i--) {
      const d = new Date(base); d.setDate(d.getDate() - i)
      const k = d.toISOString().slice(0, 10)
      const pd = new Date(d); pd.setDate(pd.getDate() - prevOffset)
      const pk = pd.toISOString().slice(0, 10)
      chartData.push({ k, pk, date: `${MONTHS_ES[d.getMonth()]} ${d.getDate()}`,
        ventas: 0, pedidos: 0, ticket: 0, _n: 0,
        ventas_prev: 0, pedidos_prev: 0, ticket_prev: 0, _pn: 0 })
    }
    for (const o of curr) {
      if (isRef(o) || isVoid(o)) continue
      const row = chartData.find(r => r.k === new Date(o.shopify_created_at).toISOString().slice(0, 10))
      if (row) { const a = parseFloat(o.amount) || 0; row.ventas += a; row.pedidos += 1; row._n += 1 }
    }
    for (const o of prev) {
      if (isRef(o) || isVoid(o)) continue
      const row = chartData.find(r => r.pk === new Date(o.shopify_created_at).toISOString().slice(0, 10))
      if (row) { const a = parseFloat(o.amount) || 0; row.ventas_prev += a; row.pedidos_prev += 1; row._pn += 1 }
    }
  }
  for (const r of chartData) {
    r.ticket      = r._n  ? r.ventas      / r._n  : 0
    r.ticket_prev = r._pn ? r.ventas_prev / r._pn : 0
  }

  // ── Return / cancellation metrics ────────────────────────────────────────
  const refOrders  = curr.filter(isRef)
  const voidOrders = curr.filter(isVoid)
  const cRefCount  = refOrders.length
  const cVoidCount = voidOrders.length
  const cRefAmt    = refOrders.reduce((s, o) => s + (parseFloat(o.amount) || 0), 0)
  const cRefPct    = cCnt ? (cRefCount  / cCnt) * 100 : 0
  const cVoidPct   = cCnt ? (cVoidCount / cCnt) * 100 : 0

  const pRefCount  = prev.filter(isRef).length
  const pVoidCount = prev.filter(isVoid).length
  const pRefAmt    = prev.filter(isRef).reduce((s, o) => s + (parseFloat(o.amount) || 0), 0)
  const pRefPct    = pCnt ? (pRefCount  / pCnt) * 100 : 0
  const pVoidPct   = pCnt ? (pVoidCount / pCnt) * 100 : 0

  // ── Channel breakdown ─────────────────────────────────────────────────────
  const chMap = {}
  for (const o of curr) {
    const ch = resolveChannel(o)
    if (!chMap[ch]) chMap[ch] = { orders: 0, revenue: 0 }
    chMap[ch].orders += 1
    if (!isRef(o) && !isVoid(o)) chMap[ch].revenue += parseFloat(o.amount) || 0
  }
  const totalChRev = Object.values(chMap).reduce((s, c) => s + c.revenue, 0)
  const channels = Object.entries(chMap)
    .map(([name, d]) => ({ name, orders: d.orders, revenue: d.revenue, pct: totalChRev ? (d.revenue / totalChRev) * 100 : 0 }))
    .sort((a, b) => b.revenue - a.revenue)

  // ── Product ranking from line_items ──────────────────────────────────────
  const pMap = {}
  for (const o of curr) {
    if (isRef(o) || isVoid(o)) continue
    for (const item of (o.line_items || [])) {
      const id  = item.product_id || item.name || 'unk'
      const qty = parseInt(item.quantity) || 1
      const rev = (parseFloat(item.price) || 0) * qty
      if (!pMap[id]) pMap[id] = { name: item.name || 'Producto', quantity: 0, revenue: 0 }
      pMap[id].quantity += qty
      pMap[id].revenue  += rev
    }
  }
  const totalRev = Object.values(pMap).reduce((s, p) => s + p.revenue, 0)
  const products = Object.values(pMap)
    .sort((a, b) => b.revenue - a.revenue)
    .map(p => ({ ...p, pct: totalRev ? (p.revenue / totalRev) * 100 : 0 }))

  return {
    kpis: {
      ingresos:    { value: cRev,      change: calcPct(cRev,      pRev)      },
      completados: { value: cDone,     change: calcPct(cDone,     pDone)     },
      ticket:      { value: cTkt,      change: calcPct(cTkt,      pTkt)      },
      convRate:    { value: cConv,     change: calcPct(cConv,     pConv)     },
      refPct:      { value: cRefPct,   change: calcPct(cRefPct,   pRefPct)   },
      voidPct:     { value: cVoidPct,  change: calcPct(cVoidPct,  pVoidPct)  },
      refAmt:      { value: cRefAmt,   change: calcPct(cRefAmt,   pRefAmt)   },
    },
    chartData: chartData.map(({ k, pk, _n, _pn, ...rest }) => rest),
    products,
    funnel: {
      completados:  cDone,
      pendientes:   curr.filter(isPending).length,
      cancelados:   cVoidCount,
      reembolsados: cRefCount,
      total: cCnt,
    },
    channels,
    refundedOrders: refOrders,
    orders: curr,
    hasData: allOrders.length > 0,
  }
}

function exportToCSV(orders, timezone) {
  const hdrs = ['Fecha','N° Pedido','Cliente','Email','Importe','Moneda','Estado','Canal']
  const rows = orders.map(o => [
    fmtDateUtil(o.shopify_created_at, timezone),
    o.order_number || '',
    o.customer_name || '—',
    o.customer_email || '',
    parseFloat(o.amount || 0).toFixed(2),
    o.currency || '',
    resolveStatus(o),
    resolveChannel(o),
  ])
  const csv = [hdrs, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = Object.assign(document.createElement('a'), { href: url, download: `ventas-${new Date().toISOString().slice(0, 10)}.csv` })
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url)
}

// ── Skeleton ──────────────────────────────────────────────────────────────────
function Sk({ className }) { return <div className={`bg-white/5 rounded animate-pulse ${className}`} /> }

// ── KPI card ──────────────────────────────────────────────────────────────────
const KPI_COLORS = {
  brand:   'bg-brand-500/10   text-brand-400',
  emerald: 'bg-emerald-500/10 text-emerald-400',
  violet:  'bg-violet-500/10  text-violet-400',
  teal:    'bg-teal-500/10    text-teal-400',
  orange:  'bg-orange-500/10  text-orange-400',
  red:     'bg-red-500/10     text-red-400',
  rose:    'bg-rose-500/10    text-rose-400',
  amber:   'bg-amber-500/10   text-amber-400',
}

function KPICard({ title, value, change, icon: Icon, color = 'brand', isMoney, isPercent, symbol, convert, loading, inverseColors, unavailable }) {
  const isGood = inverseColors ? change <= 0 : change >= 0
  const fmt = () => {
    if (isPercent) return `${value.toFixed(1)}%`
    if (isMoney) {
      const cv = convert(value)
      const d = cv < 1000 ? 2 : 0
      return `${symbol}${new Intl.NumberFormat('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d }).format(cv)}`
    }
    return new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 }).format(value)
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
      ) : unavailable ? (
        <div>
          <p className="text-2xl font-semibold text-white/20 tracking-tight">—</p>
          <p className="text-xs text-white/30 mt-1.5">Sin datos disponibles</p>
        </div>
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

// ── Compare chart ─────────────────────────────────────────────────────────────
function CompareChart({ data, mode, days, symbol, convert }) {
  const cfg = CHART_MODES.find(m => m.key === mode) ?? CHART_MODES[0]
  const prevKey = `${mode}_prev`

  const maxVal = convert(data.reduce((m, d) => Math.max(m, d[mode] ?? 0, d[prevKey] ?? 0), 0))
  const isHourly = data.length === 24 && String(data[0]?.date).endsWith('h')
  const interval = isHourly ? 5 : (Number(days) <= 7 ? 0 : Number(days) <= 14 ? 1 : Number(days) <= 30 ? 3 : 9)

  const tickFmt = v => {
    if (!cfg.isMoney) return new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 }).format(v)
    const cv = convert(v)
    if (maxVal >= 1_000_000) return `${symbol}${(cv / 1_000_000).toFixed(1)}M`
    if (maxVal >= 1_000)     return `${symbol}${(cv / 1_000).toFixed(1)}k`
    return `${symbol}${Math.round(cv)}`
  }

  function ChartTooltip({ active, payload, label }) {
    if (!active || !payload?.length) return null
    const curr = payload.find(p => p.dataKey === mode)?.value    ?? 0
    const prev = payload.find(p => p.dataKey === prevKey)?.value ?? 0
    const chg  = prev > 0 ? Math.round(((curr - prev) / prev) * 100 * 10) / 10 : null
    const fv   = v => cfg.isMoney
      ? `${symbol}${new Intl.NumberFormat('es-ES').format(convert(v))}`
      : new Intl.NumberFormat('es-ES').format(v)
    return (
      <div className="bg-surface-700 border border-white/10 rounded-xl p-3 shadow-xl text-xs min-w-[170px]">
        <p className="text-white/60 mb-2 font-medium">{label}</p>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full" style={{ background: cfg.color }} />
              <span className="text-white/60">Actual:</span>
            </div>
            <span className="text-white font-semibold">{fv(curr)}</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full" style={{ background: cfg.color, opacity: 0.35 }} />
              <span className="text-white/40">Anterior:</span>
            </div>
            <span className="text-white/50">{fv(prev)}</span>
          </div>
          {chg !== null && (
            <p className={`text-right text-[10px] font-medium mt-0.5 ${chg >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {chg >= 0 ? '+' : ''}{chg}% vs período anterior
            </p>
          )}
        </div>
      </div>
    )
  }

  const gradId = `grad-sales-${mode}`

  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={cfg.color} stopOpacity={0.15} />
            <stop offset="95%" stopColor={cfg.color} stopOpacity={0}    />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
        <XAxis dataKey="date" tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 11 }}
          axisLine={false} tickLine={false} interval={interval} />
        <YAxis tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 11 }}
          axisLine={false} tickLine={false} tickFormatter={tickFmt} width={52} />
        <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.08)', strokeWidth: 1 }} />
        <Line type="monotone" dataKey={prevKey} stroke={cfg.color} strokeWidth={1.5}
          strokeDasharray="4 4" strokeOpacity={0.35} dot={false} activeDot={false} />
        <Area type="monotone" dataKey={mode} stroke={cfg.color} strokeWidth={2}
          fill={`url(#${gradId})`} dot={false} activeDot={{ r: 4, fill: cfg.color, strokeWidth: 0 }} />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

// ── Products ranking ──────────────────────────────────────────────────────────
function ProductsRanking({ products, symbol, convert, loading }) {
  const [showAll, setShowAll] = useState(false)
  const visible = showAll ? products : products.slice(0, 10)

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
        <div>
          <h3 className="text-sm font-semibold text-white">Top Productos</h3>
          <p className="text-xs text-white/40 mt-0.5">Por ingresos en el período</p>
        </div>
        <Package size={15} className="text-white/30" />
      </div>

      {loading ? (
        <div className="p-5 space-y-3">{[1,2,3,4,5].map(i => <Sk key={i} className="h-9 w-full" />)}</div>
      ) : products.length === 0 ? (
        <div className="flex items-center justify-center py-12 text-sm text-white/30">Sin datos de productos</div>
      ) : (
        <>
          <div className="grid grid-cols-[1fr_64px_96px_60px] px-5 py-2.5 border-b border-white/5">
            {['Producto','Uds.','Ingresos','% Total'].map(h => (
              <p key={h} className="text-[11px] font-semibold text-white/30 uppercase tracking-wide">{h}</p>
            ))}
          </div>
          {visible.map((p, i) => (
            <div key={i} className="grid grid-cols-[1fr_64px_96px_60px] px-5 py-3 border-b border-white/5 last:border-0 hover:bg-white/2 transition-colors items-center gap-2">
              <div className="min-w-0">
                <p className="text-xs text-white/80 font-medium truncate">{p.name}</p>
                <div className="mt-1.5 h-1 bg-white/5 rounded-full overflow-hidden">
                  <div className="h-full bg-brand-500/50 rounded-full" style={{ width: `${p.pct}%` }} />
                </div>
              </div>
              <p className="text-xs text-white/60">{p.quantity.toLocaleString('es-ES')}</p>
              <p className="text-xs font-semibold text-white">{fmtMoney(p.revenue, symbol, convert)}</p>
              <p className="text-xs text-white/50">{p.pct.toFixed(1)}%</p>
            </div>
          ))}
          {products.length > 10 && (
            <button
              onClick={() => setShowAll(v => !v)}
              className="w-full py-3 flex items-center justify-center gap-1 text-xs text-brand-400/60 hover:text-brand-400 transition-colors border-t border-white/5"
            >
              {showAll
                ? <><ChevronUp size={13} /> Ver menos</>
                : <><ChevronDown size={13} /> Ver todos ({products.length})</>}
            </button>
          )}
        </>
      )}
    </div>
  )
}

// ── Order funnel ──────────────────────────────────────────────────────────────
function OrderFunnel({ funnel, loading }) {
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
        <div>
          <h3 className="text-sm font-semibold text-white">Embudo de Pedidos</h3>
          <p className="text-xs text-white/40 mt-0.5">{funnel?.total ?? 0} pedidos en el período</p>
        </div>
        <ShoppingBag size={15} className="text-white/30" />
      </div>

      {loading ? (
        <div className="p-5 space-y-4">{[1,2,3,4].map(i => <Sk key={i} className="h-11 w-full" />)}</div>
      ) : (
        <div className="p-5 space-y-4">
          {FUNNEL_ITEMS.map(({ key, label, bar, text, icon: Icon }) => {
            const count = funnel?.[key] ?? 0
            const pct   = funnel?.total ? (count / funnel.total) * 100 : 0
            return (
              <div key={key}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <Icon size={12} className={text} />
                    <span className="text-xs text-white/60">{label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-semibold ${text}`}>{count}</span>
                    <span className="text-[10px] text-white/30">{pct.toFixed(1)}%</span>
                  </div>
                </div>
                <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                  <div className={`h-full ${bar} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Detailed sales table ──────────────────────────────────────────────────────
function SalesTable({ orders, symbol, convert, loading }) {
  const { timezone }          = useStoreSettings()
  const [filter, setFilter]   = useState('Todos')
  const [page, setPage]       = useState(0)

  useEffect(() => { setPage(0) }, [filter])

  const filtered = useMemo(() => {
    if (filter === 'Todos') return orders
    return orders.filter(o => resolveStatus(o) === filter)
  }, [orders, filter])

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const pageRows   = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  return (
    <div className="card">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4 border-b border-white/5">
        <div>
          <h3 className="text-sm font-semibold text-white">Ventas Detalladas</h3>
          <p className="text-xs text-white/40 mt-0.5">
            {loading ? 'Cargando...' : `${filtered.length} pedidos${filter !== 'Todos' ? ` · ${filter}` : ''}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <select
              value={filter}
              onChange={e => setFilter(e.target.value)}
              className="appearance-none bg-surface-700 border border-white/5 rounded-lg pl-3 pr-7 py-1.5 text-xs text-white/60 cursor-pointer hover:border-white/10 focus:outline-none transition-colors"
            >
              {STATUS_OPTS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
          </div>
          <button
            onClick={() => exportToCSV(filtered, timezone)}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-white/10 text-white/50 hover:text-white hover:border-white/20 transition-colors"
          >
            <Download size={13} /> CSV
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 size={20} className="animate-spin text-brand-400" /></div>
      ) : filtered.length === 0 ? (
        <div className="flex items-center justify-center py-12 text-sm text-white/30">
          No hay pedidos con el filtro seleccionado
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/5">
                  {['Fecha','N° Pedido','Cliente','Productos','Importe','Estado','Canal'].map(h => (
                    <th key={h} className="px-5 py-3 text-left text-[11px] font-semibold text-white/30 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageRows.map(o => {
                  const status  = resolveStatus(o)
                  const channel = resolveChannel(o)
                  const amount  = parseFloat(o.amount || 0)
                  const items   = o.line_items || []
                  const product = items.length
                    ? (items.length > 1 ? `${items[0]?.name} +${items.length - 1}` : items[0]?.name) || '—'
                    : '—'
                  const date = fmtDatetime(o.shopify_created_at, timezone)
                  return (
                    <tr key={o.shopify_id} className="border-b border-white/5 last:border-0 hover:bg-white/2 transition-colors">
                      <td className="px-5 py-3.5 text-xs text-white/40 whitespace-nowrap">{date}</td>
                      <td className="px-5 py-3.5 text-xs font-mono text-brand-400">{o.order_number}</td>
                      <td className="px-5 py-3.5 text-sm text-white/80 font-medium max-w-[140px] truncate">{o.customer_name || '—'}</td>
                      <td className="px-5 py-3.5 text-xs text-white/50 max-w-[160px] truncate">{product}</td>
                      <td className="px-5 py-3.5 text-sm font-semibold text-white whitespace-nowrap">{fmtMoney(amount, symbol, convert)}</td>
                      <td className="px-5 py-3.5"><Badge variant={STATUS_BADGE[status] ?? 'neutral'}>{status}</Badge></td>
                      <td className="px-5 py-3.5">
                        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-md ${CHANNEL_CLS[channel] ?? 'bg-white/5 text-white/40'}`}>{channel}</span>
                      </td>
                    </tr>
                  )
                })}
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
                  className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
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
                  className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
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

// ── Return analysis ───────────────────────────────────────────────────────────
function ReturnAnalysis({ refundedOrders, refAmt, refPct, symbol, convert, loading }) {
  const { timezone } = useStoreSettings()
  const [showAll, setShowAll] = useState(false)
  const visible = showAll ? refundedOrders : refundedOrders.slice(0, 5)

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
        <div>
          <h3 className="text-sm font-semibold text-white">Análisis de Devoluciones</h3>
          <p className="text-xs text-white/40 mt-0.5">Pedidos reembolsados en el período</p>
        </div>
        <ArrowDownCircle size={15} className="text-orange-400/60" />
      </div>

      {loading ? (
        <div className="p-5 space-y-3">{[1,2,3].map(i => <Sk key={i} className="h-9 w-full" />)}</div>
      ) : (
        <>
          <div className="grid grid-cols-3 divide-x divide-white/5 border-b border-white/5">
            {[
              { label: 'Pedidos devueltos', value: refundedOrders.length, fmt: v => v },
              { label: 'Tasa devolución',   value: refPct,                fmt: v => `${v.toFixed(1)}%` },
              { label: 'Importe reembolsado', value: refAmt,              fmt: v => fmtMoney(v, symbol, convert), money: true },
            ].map(({ label, value, fmt }) => (
              <div key={label} className="px-5 py-4 text-center">
                <p className="text-lg font-semibold text-white">{fmt(value)}</p>
                <p className="text-[11px] text-white/40 mt-0.5">{label}</p>
              </div>
            ))}
          </div>

          {refundedOrders.length === 0 ? (
            <div className="flex items-center justify-center py-10 text-sm text-white/30">Sin devoluciones en el período</div>
          ) : (
            <>
              <div className="grid grid-cols-[1fr_100px_100px_90px] px-5 py-2.5 border-b border-white/5">
                {['Pedido','Cliente','Importe','Fecha'].map(h => (
                  <p key={h} className="text-[11px] font-semibold text-white/30 uppercase tracking-wide">{h}</p>
                ))}
              </div>
              {visible.map(o => (
                <div key={o.shopify_id} className="grid grid-cols-[1fr_100px_100px_90px] px-5 py-3 border-b border-white/5 last:border-0 hover:bg-white/2 transition-colors items-center">
                  <p className="text-xs font-mono text-orange-400">{o.order_number}</p>
                  <p className="text-xs text-white/60 truncate">{o.customer_name || '—'}</p>
                  <p className="text-xs font-semibold text-white">{fmtMoney(parseFloat(o.amount || 0), symbol, convert)}</p>
                  <p className="text-xs text-white/40">{fmtDateUtil(o.shopify_created_at, timezone)}</p>
                </div>
              ))}
              {refundedOrders.length > 5 && (
                <button
                  onClick={() => setShowAll(v => !v)}
                  className="w-full py-3 flex items-center justify-center gap-1 text-xs text-orange-400/60 hover:text-orange-400 transition-colors border-t border-white/5"
                >
                  {showAll
                    ? <><ChevronUp size={13} /> Ver menos</>
                    : <><ChevronDown size={13} /> Ver todos ({refundedOrders.length})</>}
                </button>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}

// ── Channel breakdown ─────────────────────────────────────────────────────────
function ChannelBreakdown({ channels, symbol, convert, loading }) {
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
        <div>
          <h3 className="text-sm font-semibold text-white">Desglose por Canal</h3>
          <p className="text-xs text-white/40 mt-0.5">Ingresos y pedidos por canal de adquisición</p>
        </div>
        <BarChart2 size={15} className="text-white/30" />
      </div>

      {loading ? (
        <div className="p-5 space-y-3">{[1,2,3,4].map(i => <Sk key={i} className="h-10 w-full" />)}</div>
      ) : channels.length === 0 ? (
        <div className="flex items-center justify-center py-10 text-sm text-white/30">Sin datos de canal</div>
      ) : (
        <>
          <div className="grid grid-cols-[1fr_72px_112px_64px] px-5 py-2.5 border-b border-white/5">
            {['Canal','Pedidos','Ingresos','% Total'].map(h => (
              <p key={h} className="text-[11px] font-semibold text-white/30 uppercase tracking-wide">{h}</p>
            ))}
          </div>
          {channels.map(ch => (
            <div key={ch.name} className="grid grid-cols-[1fr_72px_112px_64px] px-5 py-3.5 border-b border-white/5 last:border-0 hover:bg-white/2 transition-colors items-center gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className={`text-[11px] font-medium px-2 py-0.5 rounded-md ${CHANNEL_CLS[ch.name] ?? 'bg-white/5 text-white/40'}`}>{ch.name}</span>
                </div>
                <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                  <div className="h-full bg-brand-500/40 rounded-full" style={{ width: `${ch.pct}%` }} />
                </div>
              </div>
              <p className="text-xs text-white/60">{ch.orders.toLocaleString('es-ES')}</p>
              <p className="text-xs font-semibold text-white">{fmtMoney(ch.revenue, symbol, convert)}</p>
              <p className="text-xs text-white/50">{ch.pct.toFixed(1)}%</p>
            </div>
          ))}
        </>
      )}
    </div>
  )
}

// ── Page loading skeleton ─────────────────────────────────────────────────────
function PageSkeleton() {
  return (
    <div className="space-y-6 max-w-screen-xl mx-auto">
      <div className="flex justify-between items-center">
        <div className="space-y-1.5"><Sk className="h-5 w-48" /><Sk className="h-3 w-32" /></div>
        <div className="flex gap-2"><Sk className="h-8 w-32" /><Sk className="h-8 w-24" /></div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {[1,2,3,4].map(i => <div key={i} className="card p-5 space-y-3"><Sk className="h-4 w-24" /><Sk className="h-8 w-32" /><Sk className="h-3 w-20" /></div>)}
      </div>
      <div className="card p-5 space-y-4"><Sk className="h-4 w-32" /><Sk className="h-[280px] w-full" /></div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card p-5 space-y-3">{[1,2,3,4,5].map(i => <Sk key={i} className="h-9 w-full" />)}</div>
        <div className="card p-5 space-y-4">{[1,2,3,4].map(i => <Sk key={i} className="h-11 w-full" />)}</div>
      </div>
      <div className="card p-5 space-y-3"><Sk className="h-4 w-32" /><Sk className="h-[300px] w-full" /></div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Sales() {
  const { days, setDays }                     = usePeriod()
  const { symbol, convert, currency, setCurrency } = useCurrency()
  const [salesData, setSalesData]             = useState(null)
  const [loading, setLoading]                 = useState(true)
  const [chartMode, setChartMode]             = useState('ventas')

  useEffect(() => {
    if (!isSupabaseConfigured) { setLoading(false); return }
    setLoading(true)

    const { compareStart } = buildPeriodWindows(days)

    supabase
      .from('shopify_orders')
      .select('shopify_id, order_number, amount, currency, shopify_created_at, financial_status, fulfillment_status, customer_name, customer_email, line_items, source_name')
      .gte('shopify_created_at', compareStart.toISOString())
      .order('shopify_created_at', { ascending: false })
      .then(({ data: orders }) => {
        setSalesData(orders?.length ? processOrders(orders, days) : null)
        setLoading(false)
      })
  }, [days])

  // ── Not configured ──────────────────────────────────────────────────────────
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

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (loading) return <PageSkeleton />

  // ── No data ─────────────────────────────────────────────────────────────────
  if (!salesData) {
    return (
      <div className="max-w-screen-xl mx-auto flex items-center justify-center min-h-[60vh]">
        <div className="card p-12 text-center space-y-4 max-w-sm w-full">
          <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto">
            <TrendingUp size={24} className="text-emerald-400" />
          </div>
          <p className="text-base font-semibold text-white">Sin datos de ventas</p>
          <p className="text-sm text-white/40 leading-relaxed">
            Conecta tu tienda Shopify y sincroniza los pedidos para ver el análisis de ventas.
          </p>
        </div>
      </div>
    )
  }

  const { kpis, chartData, products, funnel, channels, refundedOrders, orders } = salesData
  const kpiPeriod = PERIODS.find(p => p.value === String(days))?.label ?? `${days} días`

  return (
    <div className="space-y-6 max-w-screen-xl mx-auto">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-white">Análisis de Ventas</h2>
          <p className="text-xs text-white/40 mt-0.5">{kpiPeriod} · Shopify</p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          {/* Period selector */}
          <div className="relative">
            <select value={days} onChange={e => setDays(e.target.value)}
              className="appearance-none bg-surface-700 border border-white/5 rounded-lg pl-3 pr-7 py-1.5 text-xs text-white/60 cursor-pointer hover:border-white/10 focus:outline-none transition-colors">
              {PERIODS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
            <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
          </div>
          {/* Currency selector */}
          <div className="relative">
            <select value={currency} onChange={e => setCurrency(e.target.value)}
              className="appearance-none bg-surface-700 border border-white/5 rounded-lg pl-3 pr-7 py-1.5 text-xs text-white/60 cursor-pointer hover:border-white/10 focus:outline-none transition-colors">
              {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
            </select>
            <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* ── KPIs row 1 ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KPICard title="Ingresos Totales"    value={kpis.ingresos.value}    change={kpis.ingresos.change}    icon={Euro}         color="brand"   isMoney    symbol={symbol} convert={convert} />
        <KPICard title="Pedidos Completados" value={kpis.completados.value} change={kpis.completados.change} icon={CheckCircle2} color="emerald"            symbol={symbol} convert={convert} />
        <KPICard title="Ticket Medio"        value={kpis.ticket.value}      change={kpis.ticket.change}      icon={TrendingUp}   color="violet"  isMoney    symbol={symbol} convert={convert} />
        <KPICard title="Tasa de Completados" value={kpis.convRate.value}    change={kpis.convRate.change}    icon={Target}       color="teal"    isPercent  symbol={symbol} convert={convert} />
      </div>

      {/* ── KPIs row 2 ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KPICard title="Tasa de Devoluciones" value={kpis.refPct.value}  change={kpis.refPct.change}  icon={ArrowDownCircle} color="orange" isPercent inverseColors symbol={symbol} convert={convert} />
        <KPICard title="Tasa de Cancelación"  value={kpis.voidPct.value} change={kpis.voidPct.change} icon={Ban}             color="red"    isPercent inverseColors symbol={symbol} convert={convert} />
        <KPICard title="Importe Reembolsado"  value={kpis.refAmt.value}  change={kpis.refAmt.change}  icon={CreditCard}      color="rose"   isMoney   inverseColors symbol={symbol} convert={convert} />
        <KPICard title="Descuentos Totales"   value={0}                  change={0}                   icon={Tag}             color="amber"  isMoney   unavailable   symbol={symbol} convert={convert} />
      </div>

      {/* ── Main chart ─────────────────────────────────────────────────────── */}
      <div className="card p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
          <div>
            <h3 className="text-sm font-semibold text-white">Evolución de Ventas</h3>
            <p className="text-xs text-white/40 mt-0.5 flex items-center gap-3">
              {kpiPeriod}
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-6 h-px" style={{ background: CHART_MODES.find(m=>m.key===chartMode)?.color }} />
                <span>Período actual</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-6 h-px border-t border-dashed opacity-35" style={{ borderColor: CHART_MODES.find(m=>m.key===chartMode)?.color }} />
                <span>Período anterior</span>
              </span>
            </p>
          </div>
          <div className="flex items-center gap-1 bg-surface-700 rounded-lg p-1">
            {CHART_MODES.map(({ key, label }) => (
              <button key={key} onClick={() => setChartMode(key)}
                className={`text-xs px-3 py-1.5 rounded-md transition-colors ${chartMode === key ? 'bg-brand-500/20 text-brand-400 font-medium' : 'text-white/40 hover:text-white'}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <CompareChart data={chartData} mode={chartMode} days={days} symbol={symbol} convert={convert} />
      </div>

      {/* ── Products + Funnel ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ProductsRanking products={products} symbol={symbol} convert={convert} loading={false} />
        <OrderFunnel funnel={funnel} loading={false} />
      </div>

      {/* ── Return analysis + Channel breakdown ───────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ReturnAnalysis refundedOrders={refundedOrders} refAmt={kpis.refAmt.value} refPct={kpis.refPct.value} symbol={symbol} convert={convert} loading={false} />
        <ChannelBreakdown channels={channels} symbol={symbol} convert={convert} loading={false} />
      </div>

      {/* ── Detailed table ─────────────────────────────────────────────────── */}
      <SalesTable orders={orders} symbol={symbol} convert={convert} loading={false} />

    </div>
  )
}
