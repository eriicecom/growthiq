import { Link } from 'react-router-dom'
import Badge from '@/components/ui/Badge'
import { ArrowUpRight, Loader2 } from 'lucide-react'
import { useStoreSettings } from '@/contexts/StoreSettingsContext'
import { fmtDatetime } from '@/lib/dateUtils'

// Maps Shopify financial/fulfillment status to display values
function resolveStatus(order) {
  if (order.status) return order.status // mock data already has translated status

  const { financial_status, fulfillment_status } = order
  if (financial_status === 'refunded' || financial_status === 'voided') return 'Cancelado'
  if (fulfillment_status === 'fulfilled') return 'Entregado'
  if (fulfillment_status === 'partial') return 'En tránsito'
  if (financial_status === 'paid') return 'Procesando'
  return 'Procesando'
}

function resolveChannel(order) {
  if (order.channel) return order.channel // mock data
  const src = (order.source_name || '').toLowerCase()
  if (src.includes('facebook') || src.includes('meta')) return 'Meta Ads'
  if (src.includes('tiktok')) return 'TikTok Ads'
  if (src.includes('google')) return 'Google Ads'
  if (src === 'email') return 'Email'
  if (src === 'web' || src === 'online_store') return 'Orgánico'
  return order.source_name || 'Orgánico'
}

function resolveProduct(order) {
  if (order.product) return order.product // mock data
  const items = order.line_items || []
  if (!items.length) return '—'
  const first = items[0]?.name || '—'
  return items.length > 1 ? `${first} +${items.length - 1} más` : first
}

function resolveDate(order, timezone) {
  if (order.date) return order.date // mock data
  return fmtDatetime(order.shopify_created_at, timezone)
}

function resolveAmount(order) {
  return typeof order.amount === 'number' ? order.amount : parseFloat(order.amount) || 0
}

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
  'Google Ads': 'bg-amber-500/10 text-amber-400',
}

export default function OrdersTable({ orders = [], loading = false, hasRealData = false }) {
  const { timezone } = useStoreSettings()
  return (
    <div className="card">
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
        <div>
          <h3 className="text-sm font-semibold text-white">Últimos Pedidos</h3>
          <p className="text-xs text-white/40 mt-0.5">
            {loading ? 'Cargando...' : `${orders.length} pedidos recientes${hasRealData ? ' · Shopify' : ''}`}
          </p>
        </div>
        <Link to="/orders" className="flex items-center gap-1 text-xs text-brand-400 hover:text-brand-300 transition-colors font-medium">
          Ver todos <ArrowUpRight size={13} />
        </Link>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={20} className="animate-spin text-brand-400" />
        </div>
      ) : (
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
              {orders.map((order) => {
                const status = resolveStatus(order)
                const channel = resolveChannel(order)
                const product = resolveProduct(order)
                const date = resolveDate(order, timezone)
                const amount = resolveAmount(order)
                const id = order.id || order.order_number || order.shopify_id

                return (
                  <tr
                    key={id}
                    className="border-b border-white/5 last:border-0 hover:bg-white/2 transition-colors"
                  >
                    <td className="px-5 py-3.5 text-xs font-mono text-brand-400">
                      {order.order_number || order.id}
                    </td>
                    <td className="px-5 py-3.5 text-sm text-white/80 font-medium">
                      {order.customer || order.customer_name}
                    </td>
                    <td className="px-5 py-3.5 text-xs text-white/50 max-w-[160px] truncate">{product}</td>
                    <td className="px-5 py-3.5">
                      <span className={`text-[11px] font-medium px-2 py-0.5 rounded-md ${channelConfig[channel] ?? 'bg-white/5 text-white/40'}`}>
                        {channel}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-sm font-semibold text-white">
                      {order.currency === 'USD' ? '$' : '€'}{amount.toFixed(2)}
                    </td>
                    <td className="px-5 py-3.5">
                      <Badge variant={statusConfig[status]?.variant ?? 'neutral'}>
                        {status}
                      </Badge>
                    </td>
                    <td className="px-5 py-3.5 text-xs text-white/40">{date}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
