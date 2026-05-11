import { Euro, TrendingUp, ShoppingBag, Megaphone, Ticket } from 'lucide-react'
import KPICard from '@/components/dashboard/KPICard'
import SalesChart from '@/components/dashboard/SalesChart'
import OrdersTable from '@/components/dashboard/OrdersTable'
import { adChannels } from '@/data/mockData'
import { useShopifyOrders } from '@/hooks/useShopifyOrders'

export default function Dashboard() {
  const { orders, kpis, chartData, loading, hasRealData } = useShopifyOrders()

  const kpiCards = [
    {
      title: 'Ventas Totales',
      key: 'ventas',
      icon: Euro,
      color: 'brand',
    },
    {
      title: hasRealData ? 'Ticket Medio' : 'Beneficio Neto',
      key: hasRealData ? 'ticket' : 'beneficio',
      icon: TrendingUp,
      color: 'emerald',
    },
    {
      title: 'Pedidos',
      key: 'pedidos',
      icon: ShoppingBag,
      color: 'violet',
    },
    {
      title: 'ROAS Global',
      key: 'roas',
      icon: Megaphone,
      color: 'amber',
    },
  ]

  return (
    <div className="space-y-6 max-w-screen-xl mx-auto">
      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {kpiCards.map(({ title, key, icon, color }) => {
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

      {/* Chart + Ad breakdown */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2">
          <SalesChart data={chartData} />
        </div>

        {/* Ad channels mini table */}
        <div className="card p-5 flex flex-col">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-white">Canales de Publicidad</h3>
            <p className="text-xs text-white/40 mt-0.5">ROAS por canal</p>
          </div>
          <div className="space-y-3 flex-1">
            {adChannels.map((ch) => (
              <div key={ch.channel} className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-white/70 truncate">{ch.channel}</span>
                    <span className="text-xs font-semibold text-white ml-2">{ch.roas}x</span>
                  </div>
                  <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-brand-500 rounded-full"
                      style={{ width: `${Math.min((ch.roas / 25) * 100, 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-4 border-t border-white/5 grid grid-cols-2 gap-3">
            {adChannels.map((ch) => (
              <div key={ch.channel} className="bg-surface-700 rounded-lg px-3 py-2">
                <p className="text-[10px] text-white/40 truncate">{ch.channel}</p>
                <p className="text-xs font-semibold text-white mt-0.5">
                  €{new Intl.NumberFormat('es-ES').format(ch.revenue)}
                </p>
                <p className="text-[10px] text-white/30">
                  Gasto: €{new Intl.NumberFormat('es-ES').format(ch.spend)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Orders table */}
      <OrdersTable orders={orders} loading={loading} hasRealData={hasRealData} />
    </div>
  )
}
