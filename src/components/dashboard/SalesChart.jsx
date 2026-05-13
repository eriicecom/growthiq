import {
  ResponsiveContainer,
  AreaChart, Area,
  BarChart, Bar,
  XAxis, YAxis,
  CartesianGrid, Tooltip,
} from 'recharts'

function CustomTooltip({ active, payload, label, symbol, convert }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-surface-700 border border-white/10 rounded-xl p-3 shadow-xl text-xs">
      <p className="text-white/60 mb-2 font-medium">{label}</p>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2 mb-1">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color ?? p.fill }} />
          <span className="text-white/60 capitalize">{p.name}:</span>
          <span className="text-white font-semibold">
            {p.dataKey === 'pedidos'
              ? p.value
              : symbol + new Intl.NumberFormat('es-ES').format(convert(p.value))}
          </span>
        </div>
      ))}
    </div>
  )
}

export default function SalesChart({ data, days = 30, periodLabel, symbol = '€', convert = (v) => v }) {
  const chartData = data ?? []

  const subtitle = periodLabel
    ?? (days === 'today' ? 'Hoy' : days === 'yesterday' ? 'Ayer' : `Últimos ${days} días`)

  const maxConverted = convert(
    chartData.reduce((m, d) => Math.max(m, d.ventas ?? 0, d.beneficio ?? 0), 0)
  )

  const tickFormatter = (v) => {
    const cv = convert(v)
    if (maxConverted === 0) return `${symbol}0`
    if (maxConverted >= 1_000_000) return `${symbol}${(cv / 1_000_000).toFixed(1)}M`
    if (maxConverted >= 1_000)     return `${symbol}${(cv / 1_000).toFixed(1)}k`
    return `${symbol}${Math.round(cv)}`
  }

  const header = (
    <div className="flex items-center justify-between mb-5">
      <div>
        <h3 className="text-sm font-semibold text-white">Evolución de Ventas</h3>
        <p className="text-xs text-white/40 mt-0.5">{subtitle}</p>
      </div>
      <div className="flex gap-2">
        {[
          { key: 'ventas',    color: '#4f6ef7', label: 'Ventas'    },
          { key: 'beneficio', color: '#10b981', label: 'Beneficio' },
        ].map(({ key, color, label }) => (
          <div key={key} className="flex items-center gap-1.5 text-xs text-white/50">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
            {label}
          </div>
        ))}
      </div>
    </div>
  )

  // ── Single-day: grouped BarChart ────────────────────────────────────────────
  if (chartData.length <= 1) {
    return (
      <div className="card p-5">
        {header}
        <ResponsiveContainer width="100%" height={260}>
          <BarChart
            data={chartData.length ? chartData : [{ date: subtitle, ventas: 0, beneficio: 0 }]}
            barGap={6}
            barCategoryGap="50%"
            margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
            <XAxis dataKey="date" tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={tickFormatter} width={52} />
            <Tooltip
              content={<CustomTooltip symbol={symbol} convert={convert} />}
              cursor={{ fill: 'rgba(255,255,255,0.04)' }}
            />
            <Bar dataKey="ventas"    name="Ventas"    fill="#4f6ef7" radius={[4, 4, 0, 0]} />
            <Bar dataKey="beneficio" name="Beneficio" fill="#10b981" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    )
  }

  // ── Multi-day: area chart ───────────────────────────────────────────────────
  return (
    <div className="card p-5">
      {header}
      <ResponsiveContainer width="100%" height={260}>
        <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="gradVentas" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#4f6ef7" stopOpacity={0.15} />
              <stop offset="95%" stopColor="#4f6ef7" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="gradBeneficio" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#10b981" stopOpacity={0.15} />
              <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            interval={4}
          />
          <YAxis
            tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={tickFormatter}
            width={52}
          />
          <Tooltip
            content={<CustomTooltip symbol={symbol} convert={convert} />}
            cursor={{ stroke: 'rgba(255,255,255,0.08)', strokeWidth: 1 }}
          />
          <Area
            type="monotone"
            dataKey="ventas"
            name="Ventas"
            stroke="#4f6ef7"
            strokeWidth={2}
            fill="url(#gradVentas)"
            dot={false}
            activeDot={{ r: 4, fill: '#4f6ef7', strokeWidth: 0 }}
          />
          <Area
            type="monotone"
            dataKey="beneficio"
            name="Beneficio"
            stroke="#10b981"
            strokeWidth={2}
            fill="url(#gradBeneficio)"
            dot={false}
            activeDot={{ r: 4, fill: '#10b981', strokeWidth: 0 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
