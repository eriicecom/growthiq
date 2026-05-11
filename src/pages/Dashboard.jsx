import { Euro, TrendingUp, ShoppingBag, RefreshCw, Loader2, Settings } from 'lucide-react'
import { Link } from 'react-router-dom'
import KPICard from '@/components/dashboard/KPICard'
import SalesChart from '@/components/dashboard/SalesChart'
import OrdersTable from '@/components/dashboard/OrdersTable'
import { useShopifyOrders } from '@/hooks/useShopifyOrders'

const KPI_CARDS = [
  { title: 'Ventas Totales',      key: 'ventas',    icon: Euro,         color: 'brand'   },
  { title: 'Ticket Medio',        key: 'ticket',    icon: TrendingUp,   color: 'emerald' },
  { title: 'Pedidos',             key: 'pedidos',   icon: ShoppingBag,  color: 'violet'  },
  { title: 'Beneficio Estimado',  key: 'beneficio', icon: TrendingUp,   color: 'amber'   },
]

export default function Dashboard() {
  const { orders, kpis, chartData, loading, hasRealData, sync, syncing, syncError } = useShopifyOrders()

  // ── Empty state ──────────────────────────────────────────────────────────
  if (!loading && !hasRealData) {
    return (
      <div className="max-w-screen-xl mx-auto flex items-center justify-center min-h-[60vh]">
        <div className="card p-12 text-center space-y-6 max-w-md w-full">
          <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mx-auto">
            <ShoppingBag size={28} className="text-white/30" />
          </div>

          <div>
            <p className="text-base font-semibold text-white">Sin datos de pedidos</p>
            <p className="text-sm text-white/40 mt-2 leading-relaxed">
              Conecta tu tienda Shopify en Configuración o pulsa Sincronizar para importar los pedidos.
            </p>
          </div>

          {syncError && (
            <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {syncError}
            </p>
          )}

          <div className="flex flex-col sm:flex-row gap-2 justify-center">
            <button
              onClick={sync}
              disabled={syncing}
              className="btn-primary inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {syncing
                ? <><Loader2 size={15} className="animate-spin" /> Sincronizando...</>
                : <><RefreshCw size={15} /> Sincronizar Shopify</>}
            </button>
            <Link
              to="/settings"
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm rounded-lg border border-white/10 text-white/50 hover:text-white hover:border-white/20 transition-colors"
            >
              <Settings size={15} /> Configuración
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // ── Dashboard with data (or loading skeleton) ────────────────────────────
  return (
    <div className="space-y-6 max-w-screen-xl mx-auto">

      {/* Page header with sync button */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-white">Dashboard</h2>
          <p className="text-xs text-white/40 mt-0.5">Últimos 30 días · Shopify</p>
        </div>
        <div className="flex items-center gap-3">
          {syncError && (
            <span className="text-xs text-red-400">{syncError}</span>
          )}
          <button
            onClick={sync}
            disabled={syncing}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-white/10 text-white/50 hover:text-white hover:border-white/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {syncing
              ? <><Loader2 size={13} className="animate-spin" /> Sincronizando...</>
              : <><RefreshCw size={13} /> Sincronizar</>}
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {KPI_CARDS.map(({ title, key, icon, color }) => {
          const metric = kpis[key]
          if (!metric) return null
          return (
            <KPICard
              key={key}
              title={title}
              value={metric.value}
              change={metric.change}
              prefix={metric.prefix}
              suffix={metric.suffix ?? ''}
              icon={icon}
              color={color}
              loading={loading}
            />
          )
        })}
      </div>

      {/* Chart */}
      <SalesChart data={chartData} />

      {/* Orders table */}
      <OrdersTable orders={orders} loading={loading} hasRealData={hasRealData} />
    </div>
  )
}
