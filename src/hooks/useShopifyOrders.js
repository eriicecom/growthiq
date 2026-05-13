import { useState, useEffect, useCallback } from 'react'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import { buildPeriodWindows } from '@/lib/periodUtils'
import { usePlatform } from '@/contexts/PlatformContext'

const MONTHS_ES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

// adSpendByDate: { 'YYYY-MM-DD': totalSpend } (Meta + TikTok combined)
// endDate: the reference "last day" for the chart (today for regular periods, yesterday for 'yesterday')
function buildChartData(orders, numDays, adSpendByDate = {}, endDate = new Date()) {
  const days = []
  const base = new Date(endDate); base.setHours(0, 0, 0, 0)
  for (let i = numDays - 1; i >= 0; i--) {
    const d = new Date(base)
    d.setDate(d.getDate() - i)
    const key   = d.toISOString().slice(0, 10)
    const label = `${MONTHS_ES[d.getMonth()]} ${d.getDate()}`
    days.push({ key, date: label, ventas: 0, beneficio: 0, pedidos: 0 })
  }
  orders.forEach((order) => {
    const key = new Date(order.shopify_created_at).toISOString().slice(0, 10)
    const day = days.find((d) => d.key === key)
    if (day) {
      const amount = parseFloat(order.amount) || 0
      day.ventas    += amount
      day.pedidos   += 1
      day.beneficio += Math.round(amount * 0.25)
    }
  })
  for (const day of days) {
    day.beneficio -= (adSpendByDate[day.key] || 0)
  }
  return days.map(({ key, ...rest }) => rest)
}

function buildHourlyChartData(orders, windowStart, adSpendByDate = {}) {
  const hours = Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    date: `${String(h).padStart(2, '0')}h`,
    ventas: 0, beneficio: 0, pedidos: 0,
  }))
  const dayStart = new Date(windowStart); dayStart.setHours(0, 0, 0, 0)
  const dayEnd   = new Date(dayStart);    dayEnd.setDate(dayStart.getDate() + 1)
  const dayKey   = dayStart.toISOString().slice(0, 10)
  for (const order of orders) {
    const ts = new Date(order.shopify_created_at)
    if (ts < dayStart || ts >= dayEnd) continue
    const h = ts.getHours()
    const amount = parseFloat(order.amount) || 0
    hours[h].ventas    += amount
    hours[h].pedidos   += 1
    hours[h].beneficio += Math.round(amount * 0.25)
  }
  const perHour = (adSpendByDate[dayKey] || 0) / 24
  for (const slot of hours) { slot.beneficio -= perHour }
  return hours.map(({ hour, ...rest }) => rest)
}

function calcChange(current, previous) {
  if (previous === 0) return 0
  return Math.round(((current - previous) / previous) * 100 * 10) / 10
}

function buildCostsMap(rows) {
  const map = {}
  for (const row of rows || []) {
    if (!map[row.shopify_product_id]) map[row.shopify_product_id] = {}
    map[row.shopify_product_id][row.quantity] = parseFloat(row.cost) || 0
  }
  return map
}

function calcLineItemsCOGS(lineItems, costsMap, fallbackAmount) {
  if (!lineItems?.length) return fallbackAmount * 0.30
  let total = 0
  for (const item of lineItems) {
    const pid = item.product_id
    const qty = item.quantity || 1
    const itemTotal = (parseFloat(item.price) || 0) * qty
    if (pid && costsMap[pid]) {
      const tiers = costsMap[pid]
      if (tiers[qty] !== undefined)    total += tiers[qty]
      else if (tiers[1] !== undefined) total += tiers[1] * qty
      else                             total += itemTotal * 0.30
    } else {
      total += itemTotal * 0.30
    }
  }
  return total
}

// Sum ad-spend rows for a date range.
// from / to are 'YYYY-MM-DD' strings; to is exclusive (or null = no upper bound).
function sumSpend(rows, from, to = null) {
  return rows
    .filter(r => r.date >= from && (!to || r.date < to))
    .reduce((s, r) => s + (parseFloat(r.spend) || 0), 0)
}

const ZERO_KPIS = {
  ventas:       { value: 0, change: 0 },
  pedidos:      { value: 0, change: 0 },
  ticket:       { value: 0, change: 0 },
  beneficio:    { value: 0, change: 0 },
  cogs:         { value: 0, change: 0 },
  metaSpend:    { value: 0, change: 0 },
  tiktokSpend:  { value: 0, change: 0 },
  devoluciones: { value: 0, change: 0 },
  reembolsos:   { value: 0, change: 0 },
  margen:       { value: 0, change: 0 },
}

const EMPTY_STATE = {
  orders:          [],
  kpis:            {},
  chartData:       [],
  loading:         false,
  hasRealData:     false,
  metaConnected:   false,
  tiktokConnected: false,
}

// period: 'today' | 'yesterday' | '7' | '14' | '30' | '90'
export function useShopifyOrders(period = '30') {
  const { platform }              = usePlatform()
  const [state, setState]         = useState({ ...EMPTY_STATE, loading: isSupabaseConfigured })
  const [syncing, setSyncing]     = useState(false)
  const [syncError, setSyncError] = useState('')

  const fetchData = useCallback(async () => {
    if (!isSupabaseConfigured) return

    // WordPress not yet integrated — return empty state
    if (platform === 'wordpress') {
      setState({ ...EMPTY_STATE, loading: false })
      return
    }

    try {
      const {
        windowStart, windowEnd,
        compareStart, compareEnd,
        numDays, chartEndDate, isSingleDay,
      } = buildPeriodWindows(period)

      const wStartIso = windowStart.toISOString()
      const wEndIso   = windowEnd.toISOString()
      const cStartIso = compareStart.toISOString()
      const cEndIso   = compareEnd.toISOString()

      // Date strings for ad_spend table (stored as DATE, not TIMESTAMP)
      const windowStartDate  = windowStart.toISOString().slice(0, 10)
      const compareStartDate = compareStart.toISOString().slice(0, 10)

      // For single-day periods: need to query up to the day AFTER windowStart for the spend row
      // For regular periods: just query from compareStart, no upper bound on orders
      const ordersGte = cStartIso

      const [
        { data: allOrders, error: ordersError },
        { data: connRow },
        { data: costsRows },
        { data: metaRows },
        { data: metaConn },
      ] = await Promise.all([
        supabase
          .from('shopify_orders')
          .select('shopify_id, amount, shopify_created_at, financial_status, fulfillment_status, order_number, customer_name, customer_email, currency, line_items, source_name')
          .gte('shopify_created_at', ordersGte)
          .order('shopify_created_at', { ascending: false }),
        supabase
          .from('shopify_connections')
          .select('shop_domain')
          .eq('is_active', true)
          .limit(1)
          .maybeSingle(),
        supabase.from('product_costs').select('shopify_product_id, quantity, cost'),
        supabase.from('meta_ad_spend').select('date, spend').gte('date', compareStartDate),
        supabase.from('meta_connections').select('user_id').eq('is_active', true).limit(1).maybeSingle(),
        // tiktok_ad_spend is not queried here — table will not exist until TikTok
        // integration is built; querying it would produce a 404 on every page load.
      ])

      if (ordersError) throw ordersError

      const costsMap        = buildCostsMap(costsRows)
      const metaConnected   = !!metaConn
      const tiktokConnected = false

      const safeMetaRows   = metaRows || []
      const safeTikTokRows = []        // TikTok not yet integrated

      // ── Ad spend per day (for chart) ─────────────────────────────────────
      const adSpendByDate = {}
      for (const r of [...safeMetaRows, ...safeTikTokRows]) {
        adSpendByDate[r.date] = (adSpendByDate[r.date] || 0) + (parseFloat(r.spend) || 0)
      }

      // ── Ad spend KPI values ───────────────────────────────────────────────
      let cMetaSpend, pMetaSpend, cTikTokSpend, pTikTokSpend

      if (isSingleDay) {
        // 'today' / 'yesterday': compare the exact single day vs same weekday -7 days
        const spendDate  = windowStartDate
        const cmpDate    = compareStart.toISOString().slice(0, 10)
        const pickDate   = (rows, d) => rows.filter(r => r.date === d).reduce((s, r) => s + (parseFloat(r.spend) || 0), 0)
        cMetaSpend   = pickDate(safeMetaRows,   spendDate)
        pMetaSpend   = pickDate(safeMetaRows,   cmpDate)
        cTikTokSpend = pickDate(safeTikTokRows, spendDate)
        pTikTokSpend = pickDate(safeTikTokRows, cmpDate)
      } else {
        // Regular multi-day: sum from window start (no upper bound) vs prev window
        const cmpEndDate = compareEnd.toISOString().slice(0, 10)
        cMetaSpend   = sumSpend(safeMetaRows,   windowStartDate)
        pMetaSpend   = sumSpend(safeMetaRows,   compareStartDate, cmpEndDate)
        cTikTokSpend = sumSpend(safeTikTokRows, windowStartDate)
        pTikTokSpend = sumSpend(safeTikTokRows, compareStartDate, cmpEndDate)
      }

      // ── Split orders into current / previous windows ──────────────────────
      const current  = (allOrders || []).filter(o => o.shopify_created_at >= wStartIso && o.shopify_created_at < wEndIso)
      const previous = (allOrders || []).filter(o => o.shopify_created_at >= cStartIso && o.shopify_created_at < cEndIso)

      if (!current.length && !previous.length && !(allOrders?.length)) {
        setState(!!connRow
          ? {
              orders: [], kpis: ZERO_KPIS,
              chartData: isSingleDay
                ? buildHourlyChartData([], windowStart, adSpendByDate)
                : buildChartData([], numDays, adSpendByDate, chartEndDate),
              loading: false, hasRealData: true,
              metaConnected, tiktokConnected,
            }
          : { ...EMPTY_STATE }
        )
        return
      }

      const isRefunded = (o) => o.financial_status === 'refunded' || o.financial_status === 'partially_refunded'
      const isVoided   = (o) => o.financial_status === 'voided'
      // Revenue: exclude refunded and voided (cancelled) orders
      const sumNet     = (arr) => arr.reduce((s, o) => (isRefunded(o) || isVoided(o)) ? s : s + (parseFloat(o.amount) || 0), 0)
      const sumRefunds = (arr) => arr.filter(isRefunded).reduce((s, o) => s + (parseFloat(o.amount) || 0), 0)

      const cRevenue = sumNet(current);   const pRevenue = sumNet(previous)
      const cOrders  = current.length;   const pOrders  = previous.length
      const cTicket  = cOrders ? Math.round((cRevenue / cOrders) * 100) / 100 : 0
      const pTicket  = pOrders ? pRevenue / pOrders : 0

      const sumCOGS = (arr) =>
        arr.filter(o => !isRefunded(o) && !isVoided(o))
           .reduce((s, o) => s + calcLineItemsCOGS(o.line_items, costsMap, parseFloat(o.amount) || 0), 0)

      const cCOGS = Math.round(sumCOGS(current) * 100) / 100
      const pCOGS = Math.round(sumCOGS(previous) * 100) / 100

      // Beneficio = Ventas − COGS − Meta − TikTok
      const cBeneficio = Math.round((cRevenue - cCOGS - cMetaSpend - cTikTokSpend) * 100) / 100
      const pBeneficio = Math.round((pRevenue - pCOGS - pMetaSpend - pTikTokSpend) * 100) / 100

      const cRefundN = current.filter(isRefunded).length
      const pRefundN = previous.filter(isRefunded).length
      const cDevPct  = cOrders ? Math.round((cRefundN / cOrders) * 1000) / 10 : 0
      const pDevPct  = pOrders ? Math.round((pRefundN / pOrders) * 1000) / 10 : 0

      const cReemb = sumRefunds(current); const pReemb = sumRefunds(previous)

      const cMargen = cRevenue ? Math.round((cBeneficio / cRevenue) * 1000) / 10 : 0
      const pMargen = pRevenue ? Math.round((pBeneficio / pRevenue) * 1000) / 10 : 0

      setState({
        orders:   current.slice(0, 10),
        kpis: {
          ventas:       { value: cRevenue,   change: calcChange(cRevenue,    pRevenue)    },
          pedidos:      { value: cOrders,    change: calcChange(cOrders,     pOrders)     },
          ticket:       { value: cTicket,    change: calcChange(cTicket,     pTicket)     },
          beneficio:    { value: cBeneficio, change: calcChange(cBeneficio,  pBeneficio)  },
          cogs:         { value: cCOGS,      change: calcChange(cCOGS,       pCOGS)       },
          metaSpend:    { value: Math.round(cMetaSpend   * 100) / 100, change: calcChange(cMetaSpend,   pMetaSpend)   },
          tiktokSpend:  { value: Math.round(cTikTokSpend * 100) / 100, change: calcChange(cTikTokSpend, pTikTokSpend) },
          devoluciones: { value: cDevPct,    change: calcChange(cDevPct,     pDevPct)     },
          reembolsos:   { value: cReemb,     change: calcChange(cReemb,      pReemb)      },
          margen:       { value: cMargen,    change: calcChange(cMargen,     pMargen)     },
        },
        chartData: isSingleDay
          ? buildHourlyChartData(
              [...current].sort((a, b) => a.shopify_created_at.localeCompare(b.shopify_created_at)),
              windowStart,
              adSpendByDate
            )
          : buildChartData(
              [...current].sort((a, b) => a.shopify_created_at.localeCompare(b.shopify_created_at)),
              numDays,
              adSpendByDate,
              chartEndDate
            ),
        loading: false,
        hasRealData: true,
        metaConnected,
        tiktokConnected,
      })
    } catch (err) {
      console.error('[useShopifyOrders]', err)
      setState({ ...EMPTY_STATE })
    }
  }, [period, platform])

  const sync = useCallback(async () => {
    setSyncing(true)
    setSyncError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/.netlify/functions/shopify-fetch-orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session ? { 'Authorization': `Bearer ${session.access_token}` } : {}),
        },
      })
      let resData = {}
      try { resData = await res.json() } catch { /* non-JSON */ }
      if (!res.ok) throw new Error(resData.error || `Error del servidor (${res.status})`)
      await fetchData()
    } catch (err) {
      setSyncError(err.message)
    } finally {
      setSyncing(false)
    }
  }, [fetchData])

  useEffect(() => {
    if (!isSupabaseConfigured) return

    fetchData()

    let channel
    let cancelled = false

    function handleVisibility() {
      if (document.visibilityState === 'visible') fetchData()
    }
    document.addEventListener('visibilitychange', handleVisibility)

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return
      const uid = session?.user?.id
      if (!uid) return

      channel = supabase
        .channel(`shopify-orders-${uid}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'shopify_orders', filter: `user_id=eq.${uid}` },
          (payload) => {
            console.log('[realtime] change received', payload)
            fetchData()
          }
        )
        .subscribe((status) => {
          console.log('[realtime] status:', status)
          if (status === 'SUBSCRIBED')    console.log('[realtime] subscribed to shopify_orders')
          if (status === 'CHANNEL_ERROR') console.error('[realtime] shopify_orders channel error')
        })
    })

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', handleVisibility)
      if (channel) supabase.removeChannel(channel)
    }
  }, [fetchData])

  return { ...state, syncing, syncError, sync }
}
