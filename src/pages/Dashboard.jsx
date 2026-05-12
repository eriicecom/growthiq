import {
  Euro, TrendingUp, ShoppingBag, Package, RotateCcw,
  CreditCard, Percent, RefreshCw, Loader2, Settings,
  AlertCircle, ChevronDown,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import KPICard from '@/components/dashboard/KPICard'
import SalesChart from '@/components/dashboard/SalesChart'
import OrdersTable from '@/components/dashboard/OrdersTable'
import { useShopifyOrders } from '@/hooks/useShopifyOrders'
import { useCurrency, CURRENCIES } from '@/hooks/useCurrency'
import { isSupabaseConfigured } from '@/lib/supabase'

// isMoney   → apply currency conversion + show symbol
// isPercent → display as X.X% (no conversion)
// inverseColors → red when rising, green when falling (bad if high)
const KPI_CARDS = [
  { title: 'Ventas Totales',          key: 'ventas',       icon: Euro,       color: 'brand',   isMoney: true  },
  { title: 'Ticket Medio',            key: 'ticket',       icon: TrendingUp, color: 'emerald', isMoney: true  },
  { title: 'Pedidos',                 key: 'pedidos',      icon: ShoppingBag,color: 'violet'   },
  { title: 'Beneficio Neto',          key: 'beneficio',    icon: TrendingUp, color: 'amber',   isMoney: true  },
  {
    title: 'Costes de Producto',
    key: 'cogs', icon: Package, color: 'rose', isMoney: true,
    note: 'Estimado · Configura tus costes reales en Ajustes',
  },
  { title: '% Devoluciones',          key: 'devoluciones', icon: RotateCcw,  color: 'orange',  isPercent: true, inverseColors: true },
  { title: 'Reembolsos',              key: 'reembolsos',   icon: CreditCard, color: 'red',     isMoney: true,   inverseColors: true },
  { title: 'Margen Neto',             key: 'margen',       icon: Percent,    color: 'teal',    isPercent: true  },
]

function CurrencySelector({ currency, setCurrency }) {
  return (
    <div className="relative">
      <select
        value={currency}
        onChange={(e) => setCurrency(e.target.value)}
        className="appearance-none bg-surface-700 border border-white/5 rounded-lg pl-3 pr-7 py-1.5 text-xs text-white/60 cursor-pointer hover:border-white/10 focus:outline-none transition-colors"
      >
        {CURRENCIES.map((c) => (
          <option key={c.code} value={c.code}>{c.label}</option>
        ))}
      </select>
      <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
    </div>
  )
}

function SyncButton({ onClick, syncing, small = false }) {
  const base = small
    ? 'flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-white/10 text-white/50 hover:text-white hover:border-white/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed'
    : 'btn-primary inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm disabled:opacity-50 disabled:cursor-not-allowed'
  return (
    <button onClick={onClick} disabled={syncing} className={base}>
      {syncing
        ? <><Loader2 size={small ? 13 : 15} className="animate-spin" /> Sincronizando...</>
        : <><RefreshCw size={small ? 13 : 15} /> {small ? 'Sincronizar' : 'Sincronizar Shopify'}</>}
    </button>
  )
}

function ErrorBanner({ message }) {
  if (!message) return null
  return (
    <div className="flex items-start gap-2.5 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
      <AlertCircle size={15} className="text-red-400 shrink-0 mt-0.5" />
      <p className="text-sm text-red-300">{message}</p>
    </div>
  )
}

export default function Dashboard() {
  const { orders, kpis, chartData, loading, hasRealData, sync, syncing, syncError } = useShopifyOrders()
  const { currency, setCurrency, symbol, convert } = useCurrency()

  // ── Supabase not configured ──────────────────────────────────────────────
  if (!isSupabaseConfigured) {
    return (
      <div className="max-w-screen-xl mx-auto flex items-center justify-center min-h-[60vh]">
        <div className="card p-10 text-center space-y-4 max-w-sm w-full">
          <AlertCircle size={32} className="mx-auto text-amber-400" />
          <p className="text-sm font-semibold text-white">Supabase no configurado</p>
          <p className="text-xs text-white/40 leading-relaxed">
            Añade <code className="bg-white/5 px-1 rounded">VITE_SUPABASE_URL</code> y{' '}
            <code className="bg-white/5 px-1 rounded">VITE_SUPABASE_ANON_KEY</code> en tu archivo{' '}
            <code className="bg-white/5 px-1 rounded">.env</code>.
          </p>
        </div>
      </div>
    )
  }

  // ── Empty / onboarding state ─────────────────────────────────────────────
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
          <ErrorBanner message={syncError} />
          <div className="flex flex-col sm:flex-row gap-2 justify-center">
            <SyncButton onClick={sync} syncing={syncing} />
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

  const showLoading = loading || syncing

  return (
    <div className="space-y-6 max-w-screen-xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-white">Dashboard</h2>
          <p className="text-xs text-white/40 mt-0.5">Últimos 30 días · Shopify</p>
        </div>
        <div className="flex items-center gap-2">
          <CurrencySelector currency={currency} setCurrency={setCurrency} />
          <SyncButton onClick={sync} syncing={syncing} small />
        </div>
      </div>

      {syncError && <ErrorBanner message={syncError} />}

      {/* 8 KPI cards — 4 cols desktop, 2 tablet, 1 mobile */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {KPI_CARDS.map(({ title, key, icon, color, isMoney, isPercent, inverseColors, note }) => {
          const metric = kpis[key]
          if (!metric) return null
          const displayValue = isMoney ? convert(metric.value) : metric.value
          const prefix = isMoney ? symbol : ''
          return (
            <KPICard
              key={key}
              title={title}
              value={displayValue}
              change={metric.change}
              prefix={prefix}
              isPercent={isPercent}
              inverseColors={inverseColors}
              note={note}
              icon={icon}
              color={color}
              loading={showLoading}
            />
          )
        })}
      </div>

      {/* Chart */}
      <SalesChart data={chartData} />

      {/* Orders table */}
      <OrdersTable orders={orders} loading={showLoading} hasRealData={hasRealData} />
    </div>
  )
}
