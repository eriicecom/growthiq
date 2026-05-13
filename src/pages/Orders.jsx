import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Search, X, ShoppingCart, AlertCircle } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import OrdersTable from '@/components/dashboard/OrdersTable'

function matchesSearch(order, term) {
  const t = term.toLowerCase()
  return (
    order.order_number?.toLowerCase().includes(t) ||
    order.customer_name?.toLowerCase().includes(t) ||
    order.customer_email?.toLowerCase().includes(t) ||
    order.line_items?.some((i) => i.name?.toLowerCase().includes(t))
  )
}

export default function Orders() {
  const [orders, setOrders]   = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')

  const [searchParams, setSearchParams] = useSearchParams()
  const urlQ = searchParams.get('q') || ''
  const [search, setSearch] = useState(urlQ)

  // Sync local search with URL param (e.g. when navigating from Header search)
  useEffect(() => { setSearch(urlQ) }, [urlQ])

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setLoading(false)
      return
    }

    supabase
      .from('shopify_orders')
      .select('shopify_id, amount, shopify_created_at, financial_status, fulfillment_status, order_number, customer_name, customer_email, customer_phone, currency, line_items, source_name')
      .order('shopify_created_at', { ascending: false })
      .limit(500)
      .then(({ data, error: err }) => {
        if (err) setError(err.message)
        setOrders(data || [])
        setLoading(false)
      })
  }, [])

  function handleSearchChange(value) {
    setSearch(value)
    if (value.trim()) {
      setSearchParams({ q: value }, { replace: true })
    } else {
      setSearchParams({}, { replace: true })
    }
  }

  const filtered = search.trim()
    ? orders.filter((o) => matchesSearch(o, search))
    : orders

  if (!isSupabaseConfigured) {
    return (
      <div className="max-w-screen-xl mx-auto flex items-center justify-center min-h-[60vh]">
        <div className="card p-10 text-center space-y-3 max-w-sm w-full">
          <AlertCircle size={28} className="mx-auto text-amber-400" />
          <p className="text-sm font-semibold text-white">Supabase no configurado</p>
          <p className="text-xs text-white/40">Conecta Supabase para ver tus pedidos.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5 max-w-screen-xl mx-auto">

      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-white">Gestión de Pedidos</h2>
          <p className="text-xs text-white/40 mt-0.5">
            {loading
              ? 'Cargando pedidos...'
              : search.trim()
                ? `${filtered.length} resultado${filtered.length !== 1 ? 's' : ''} de ${orders.length} pedidos`
                : `${orders.length} pedidos`}
          </p>
        </div>

        {/* Search input */}
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Buscar pedido, cliente, producto..."
            className="bg-surface-700 border border-white/10 rounded-lg pl-9 pr-8 py-2 text-sm text-white placeholder-white/25 focus:outline-none focus:border-brand-500/50 focus:ring-1 focus:ring-brand-500/20 transition-colors w-full sm:w-72"
          />
          {search && (
            <button
              onClick={() => handleSearchChange('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
            >
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="flex items-start gap-2.5 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
          <AlertCircle size={15} className="text-red-400 shrink-0 mt-0.5" />
          <p className="text-sm text-red-300">{error}</p>
        </div>
      )}

      {/* Empty state when no orders at all */}
      {!loading && !error && orders.length === 0 && (
        <div className="flex flex-col items-center justify-center min-h-[40vh] text-center">
          <div className="w-14 h-14 rounded-2xl bg-brand-500/10 flex items-center justify-center mb-4">
            <ShoppingCart size={24} className="text-brand-400" />
          </div>
          <p className="text-base font-semibold text-white">Sin pedidos</p>
          <p className="text-sm text-white/40 mt-1.5 max-w-xs leading-relaxed">
            Conecta tu tienda Shopify y sincroniza para ver todos tus pedidos aquí.
          </p>
        </div>
      )}

      {/* Orders table */}
      {(loading || orders.length > 0) && (
        <OrdersTable orders={filtered} loading={loading} hasRealData={true} />
      )}
    </div>
  )
}
