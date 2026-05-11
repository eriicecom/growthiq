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
      day.ventas += amount
      day.pedidos += 1
      day.beneficio += Math.round(amount * 0.25)
    }
  })
  return days.map(({ key, ...rest }) => rest)
}

function calcChange(current, previous) {
  if (previous === 0) return 0
  return Math.round(((current - previous) / previous) * 100 * 10) / 10
}

const ZERO_KPIS = {
  ventas:    { value: 0, change: 0, prefix: '€' },
  pedidos:   { value: 0, change: 0, prefix: '' },
  ticket:    { value: 0, change: 0, prefix: '€' },
  beneficio: { value: 0, change: 0, prefix: '€' },
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
      const sixtyDaysAgo = new Date()
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

      // Run both queries in parallel
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

      const isConnected = !!connRow

      // No orders in the 60-day window
      if (!orders60d?.length) {
        if (isConnected) {
          // Shopify is connected but the store has no recent orders — show
          // dashboard with zero KPIs instead of the empty/onboarding state.
          setState({
            orders: [],
            kpis: ZERO_KPIS,
            chartData: buildChartData([]),
            loading: false,
            hasRealData: true,
          })
        } else {
          setState({ ...EMPTY_STATE })
        }
        return
      }

      const t30Iso = thirtyDaysAgo.toISOString()
      const current = orders60d.filter((o) => o.shopify_created_at >= t30Iso)
      const previous = orders60d.filter((o) => o.shopify_created_at < t30Iso)

      const sumRevenue = (arr) =>
        arr.reduce((s, o) => (o.financial_status !== 'refunded' ? s + (parseFloat(o.amount) || 0) : s), 0)

      const currentRevenue  = sumRevenue(current)
      const previousRevenue = sumRevenue(previous)
      const currentOrders   = current.length
      const previousOrders  = previous.length
      const currentTicket   = currentOrders ? Math.round((currentRevenue / currentOrders) * 100) / 100 : 0
      const previousTicket  = previousOrders ? previousRevenue / previousOrders : 0

      setState({
        orders: current.slice(0, 10),
        kpis: {
          ventas:    { value: currentRevenue,                    change: calcChange(currentRevenue, previousRevenue), prefix: '€' },
          pedidos:   { value: currentOrders,                     change: calcChange(currentOrders, previousOrders),   prefix: '' },
          ticket:    { value: currentTicket,                     change: calcChange(currentTicket, previousTicket),   prefix: '€' },
          beneficio: { value: Math.round(currentRevenue * 0.25), change: calcChange(currentRevenue, previousRevenue), prefix: '€' },
        },
        chartData: buildChartData([...current].sort((a, b) => a.shopify_created_at.localeCompare(b.shopify_created_at))),
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
      const res = await fetch('/.netlify/functions/shopify-fetch-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      let resData = {}
      try { resData = await res.json() } catch { /* non-JSON response (e.g. timeout) */ }

      if (!res.ok) {
        throw new Error(resData.error || `Error del servidor (${res.status})`)
      }

      // Refresh data from Supabase after successful sync
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

    const channel = supabase
      .channel('shopify-orders-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shopify_orders' }, fetchData)
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [fetchData])

  return { ...state, syncing, syncError, sync }
}
