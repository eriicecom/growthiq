import { TrendingUp, TrendingDown } from 'lucide-react'
import clsx from 'clsx'

// Format a KPI value for display
function formatValue(value, prefix, isPercent) {
  if (isPercent) return `${value.toFixed(1)}%`
  if (!prefix) return new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 }).format(value)
  // Monetary: 2 decimal places below 1000, 0 above
  const decimals = value < 1000 ? 2 : 0
  const num = new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value)
  return `${prefix}${num}`
}

const COLOR_MAP = {
  brand:   { icon: 'bg-brand-500/10   text-brand-400'   },
  emerald: { icon: 'bg-emerald-500/10 text-emerald-400' },
  violet:  { icon: 'bg-violet-500/10  text-violet-400'  },
  amber:   { icon: 'bg-amber-500/10   text-amber-400'   },
  rose:    { icon: 'bg-rose-500/10    text-rose-400'    },
  orange:  { icon: 'bg-orange-500/10  text-orange-400'  },
  red:     { icon: 'bg-red-500/10     text-red-400'     },
  teal:    { icon: 'bg-teal-500/10    text-teal-400'    },
}

export default function KPICard({
  title,
  value,
  change,
  prefix = '',
  isPercent = false,
  inverseColors = false,  // true = lower change is good (e.g. devoluciones, reembolsos)
  note,                   // small explanatory text shown below the change indicator
  icon: Icon,
  color = 'brand',
  loading = false,
}) {
  // For regular KPIs: green when change >= 0. For inverse: green when change <= 0.
  const isGood = inverseColors ? change <= 0 : change >= 0
  const c = COLOR_MAP[color] ?? COLOR_MAP.brand

  return (
    <div className="card p-5 flex flex-col gap-3 hover:border-white/10 transition-colors">
      <div className="flex items-start justify-between">
        <p className="text-sm text-white/50 font-medium leading-snug">{title}</p>
        <div className={clsx('w-9 h-9 rounded-lg flex items-center justify-center shrink-0', c.icon)}>
          <Icon size={18} />
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          <div className="h-7 w-28 bg-white/5 rounded animate-pulse" />
          <div className="h-3.5 w-20 bg-white/5 rounded animate-pulse" />
        </div>
      ) : (
        <div>
          <p className="text-2xl font-semibold text-white tracking-tight">
            {formatValue(value, prefix, isPercent)}
          </p>

          <div className={clsx(
            'flex items-center gap-1 mt-1.5 text-xs font-medium',
            isGood ? 'text-emerald-400' : 'text-red-400'
          )}>
            {isGood ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            <span>{change >= 0 ? '+' : ''}{change}% vs período anterior</span>
          </div>

          {note && (
            <p className="text-[10px] text-white/25 mt-1.5 leading-relaxed">{note}</p>
          )}
        </div>
      )}
    </div>
  )
}
