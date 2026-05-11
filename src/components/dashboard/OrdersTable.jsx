import { recentOrders } from '@/data/mockData'
import Badge from '@/components/ui/Badge'
import { ArrowUpRight } from 'lucide-react'

const statusConfig = {
  'Entregado':   { variant: 'success' },
  'En tránsito': { variant: 'info' },
  'Procesando':  { variant: 'warning' },
  'Cancelado':   { variant: 'danger' },
}

const channelConfig = {
  'Meta Ads':   'bg-blue-500/10 text-blue-400',
  'TikTok Ads': 'bg-pink-500/10 text-pink-400',
  'Orgánico':   'bg-emerald-500/10 text-emerald-400',
  'Email':      'bg-violet-500/10 text-violet-400',
}

export default function OrdersTable() {
  return (
    <div className="card">
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
        <div>
          <h3 className="text-sm font-semibold text-white">Últimos Pedidos</h3>
          <p className="text-xs text-white/40 mt-0.5">{recentOrders.length} pedidos recientes</p>
        </div>
        <button className="flex items-center gap-1 text-xs text-brand-400 hover:text-brand-300 transition-colors font-medium">
          Ver todos <ArrowUpRight size={13} />
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/5">
              {['Pedido', 'Cliente', 'Producto', 'Canal', 'Importe', 'Estado', 'Fecha'].map((h) => (
                <th key={h} className="px-5 py-3 text-left text-[11px] font-semibold text-white/30 uppercase tracking-wide">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {recentOrders.map((order, i) => (
              <tr
                key={order.id}
                className="border-b border-white/5 last:border-0 hover:bg-white/2 transition-colors group"
              >
                <td className="px-5 py-3.5 text-xs font-mono text-brand-400">{order.id}</td>
                <td className="px-5 py-3.5 text-sm text-white/80 font-medium">{order.customer}</td>
                <td className="px-5 py-3.5 text-xs text-white/50 max-w-[160px] truncate">{order.product}</td>
                <td className="px-5 py-3.5">
                  <span className={`text-[11px] font-medium px-2 py-0.5 rounded-md ${channelConfig[order.channel] ?? 'bg-white/5 text-white/40'}`}>
                    {order.channel}
                  </span>
                </td>
                <td className="px-5 py-3.5 text-sm font-semibold text-white">
                  €{order.amount.toFixed(2)}
                </td>
                <td className="px-5 py-3.5">
                  <Badge variant={statusConfig[order.status]?.variant ?? 'neutral'}>
                    {order.status}
                  </Badge>
                </td>
                <td className="px-5 py-3.5 text-xs text-white/40">{order.date}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
