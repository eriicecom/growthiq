import { useState, useEffect, useCallback } from 'react'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'

const MONTHS_ES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

function buildChartData(orders) {
  const days = []
  for (let i = 29; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    const label = `${MONTHS_ES[d.getMonth()]} ${d.getDate()}`
    days.push({ key, date: label, ventas: 0, beneficio: 0, pedidos: 0 })
  }
  orders.forEach((order) => {
    const key = new Date(order.shopify_created_at).toISOString().slice(0, 10)
    const day = days.find((d) => d.key === key)
    if (day) {
      const amount = parseFloat(order.amount) || 0
      day.ventas   += amount
      day.pedidos  += 1
      day.beneficio += Math.round(amount * 0.25)
    }
  })
  return days.map(({ key, ...rest }) => rest)
}

function calcChange(current, previous) {
  if (previous === 0) return 0
  return Math.round(((current - previous) / previous) * 100 * 10) / 10
}

// Zero-value KPIs for connected stores with no recent orders
const ZERO_KPIS = {
  ventas:       { value: 0, change: 0 },
  pedidos:      { value: 0, change: 0 },
  ticket:       { value: 0, change: 0 },
  beneficio:    { value: 0, change: 0 },
  cogs:         { value: 0, change: 0 },
  devoluciones: { value: 0, change: 0 },
  reembolsos:   { value: 0, change: 0 },
  margen:       { value: 0, change: 0 },
}

const EMPTY_STATE = {
  orders: [],
  kpis: {},
  chartData: [],
  loading: false,
  hasRealData: false,
}

export function useShopifyOrders() {
  const [state, setState] = useState({ ...EMPTY_STATE, loading: isSupabaseConfigured })
  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState('')

  const fetchData = useCallback(async () => {
    if (!isSupabaseConfigured) return

    try {
      const sixtyDaysAgo  = new Date(); sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)
      const thirtyDaysAgo = new Date(); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

      const [{ data: orders60d, error }, { data: connRow }] = await Promise.all([
        supabase
          .from('shopify_orders')
          .select('shopify_id, amount, shopify_created_at, financial_status, fulfillment_status, order_number, customer_name, customer_email, currency, line_items, source_name')
          .gte('shopify_created_at', sixtyDaysAgo.toISOString())
          .order('shopify_created_at', { ascending: false }),
        supabase
          .from('shopify_connections')
          .select('shop_domain')
          .eq('is_active', true)
          .limit(1)
          .maybeSingle(),
      ])

      if (error) throw error

      if (!orders60d?.length) {
        setState(!!connRow
          ? { orders: [], kpis: ZERO_KPIS, chartData: buildChartData([]), loading: false, hasRealData: true }
          : { ...EMPTY_STATE }
        )
        return
      }

      const t30Iso   = thirtyDaysAgo.toISOString()
      const current  = orders60d.filter((o) => o.shopify_created_at >= t30Iso)
      const previous = orders60d.filter((o) => o.shopify_created_at < t30Iso)

      const isRefunded   = (o) => o.financial_status === 'refunded' || o.financial_status === 'partially_refunded'
      const sumNet       = (arr) => arr.reduce((s, o) => isRefunded(o) ? s : s + (parseFloat(o.amount) || 0), 0)
      const sumRefunds   = (arr) => arr.filter(isRefunded).reduce((s, o) => s + (parseFloat(o.amount) || 0), 0)

      // ── Core metrics ───────────────────────────────────────────────────────
      const cRevenue   = sumNet(current);       const pRevenue  = sumNet(previous)
      const cOrders    = current.length;        const pOrders   = previous.length
      const cTicket    = cOrders ? Math.round((cRevenue / cOrders) * 100) / 100 : 0
      const pTicket    = pOrders ? pRevenue / pOrders : 0

      // ── New KPIs ───────────────────────────────────────────────────────────
      const cCOGS      = Math.round(cRevenue * 0.30 * 100) / 100
      const pCOGS      = Math.round(pRevenue * 0.30 * 100) / 100

      const cBeneficio = Math.round(cRevenue * 0.25 * 100) / 100
      const pBeneficio = Math.round(pRevenue * 0.25 * 100) / 100

      const cRefundN   = current.filter(isRefunded).length
      const pRefundN   = previous.filter(isRefunded).length
      const cDevPct    = cOrders ? Math.round((cRefundN  / cOrders)  * 1000) / 10 : 0
      const pDevPct    = pOrders ? Math.round((pRefundN  / pOrders)  * 1000) / 10 : 0

      const cReemb     = sumRefunds(current);  const pReemb = sumRefunds(previous)

      const cMargen    = cRevenue ? Math.round((cBeneficio / cRevenue) * 1000) / 10 : 0
      const pMargen    = pRevenue ? Math.round((pBeneficio / pRevenue) * 1000) / 10 : 0

      setState({
        orders:   current.slice(0, 10),
        kpis: {
          ventas:       { value: cRevenue,    change: calcChange(cRevenue,   pRevenue)  },
          pedidos:      { value: cOrders,     change: calcChange(cOrders,    pOrders)   },
          ticket:       { value: cTicket,     change: calcChange(cTicket,    pTicket)   },
          beneficio:    { value: cBeneficio,  change: calcChange(cBeneficio, pBeneficio) },
          cogs:         { value: cCOGS,       change: calcChange(cCOGS,      pCOGS)     },
          devoluciones: { value: cDevPct,     change: calcChange(cDevPct,    pDevPct)   },
          reembolsos:   { value: cReemb,      change: calcChange(cReemb,     pReemb)    },
          margen:       { value: cMargen,     change: calcChange(cMargen,    pMargen)   },
        },
        chartData: buildChartData(
          [...current].sort((a, b) => a.shopify_created_at.localeCompare(b.shopify_created_at))
        ),
        loading: false,
        hasRealData: true,
      })
    } catch (err) {
      console.error('[useShopifyOrders]', err)
      setState({ ...EMPTY_STATE })
    }
  }, [])

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
      try { resData = await res.json() } catch { /* non-JSON (e.g. timeout) */ }

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

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return
      const uid = session?.user?.id
      if (!uid) return

      channel = supabase
        .channel(`shopify-orders-${uid}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'shopify_orders', filter: `user_id=eq.${uid}` },
          fetchData
        )
        .subscribe()
    })

    return () => {
      cancelled = true
      if (channel) supabase.removeChannel(channel)
    }
  }, [fetchData])

  return { ...state, syncing, syncError, sync }
}
