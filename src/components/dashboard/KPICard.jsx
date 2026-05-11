import { TrendingUp, TrendingDown } from 'lucide-react'
import clsx from 'clsx'

function formatValue(value, prefix, suffix) {
  if (prefix === '€') {
    return prefix + new Intl.NumberFormat('es-ES').format(value)
  }
  if (suffix === 'x') {
    return value.toFixed(2) + suffix
  }
  return prefix + new Intl.NumberFormat('es-ES').format(value)
}

export default function KPICard({ title, value, change, prefix = '', suffix = '', icon: Icon, color = 'brand', loading = false }) {
  const positive = change >= 0

  const colorMap = {
    brand:   { icon: 'bg-brand-500/10 text-brand-400',   glow: '' },
    emerald: { icon: 'bg-emerald-500/10 text-emerald-400', glow: '' },
    violet:  { icon: 'bg-violet-500/10 text-violet-400',  glow: '' },
    amber:   { icon: 'bg-amber-500/10 text-amber-400',   glow: '' },
  }

  const c = colorMap[color] ?? colorMap.brand

  return (
    <div className="card p-5 flex flex-col gap-4 hover:border-white/10 transition-colors">
      <div className="flex items-start justify-between">
        <p className="text-sm text-white/50 font-medium">{title}</p>
        <div className={clsx('w-9 h-9 rounded-lg flex items-center justify-center', c.icon)}>
          <Icon size={18} />
        </div>
      </div>

      <div>
        {loading ? (
          <div className="space-y-2">
            <div className="h-7 w-28 bg-white/5 rounded animate-pulse" />
            <div className="h-4 w-20 bg-white/5 rounded animate-pulse" />
          </div>
        ) : (
          <>
            <p className="text-2xl font-semibold text-white tracking-tight">
              {formatValue(value, prefix, suffix)}
            </p>
            <div className={clsx(
              'flex items-center gap-1 mt-1.5 text-xs font-medium',
              positive ? 'text-emerald-400' : 'text-red-400'
            )}>
              {positive ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
              <span>{positive ? '+' : ''}{change}% vs mes anterior</span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
