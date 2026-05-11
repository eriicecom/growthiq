import clsx from 'clsx'

const colorMap = {
  brand:   { bg: 'bg-brand-500/10',   text: 'text-brand-400',   border: 'border-brand-500/20' },
  emerald: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20' },
  violet:  { bg: 'bg-violet-500/10',  text: 'text-violet-400',  border: 'border-violet-500/20' },
  amber:   { bg: 'bg-amber-500/10',   text: 'text-amber-400',   border: 'border-amber-500/20' },
  pink:    { bg: 'bg-pink-500/10',    text: 'text-pink-400',    border: 'border-pink-500/20' },
  blue:    { bg: 'bg-blue-500/10',    text: 'text-blue-400',    border: 'border-blue-500/20' },
}

export default function EmptyPage({ icon: Icon, title, description, color = 'brand', features = [] }) {
  const c = colorMap[color] ?? colorMap.brand

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <div className={clsx('w-16 h-16 rounded-2xl flex items-center justify-center mb-5 border', c.bg, c.border)}>
        <Icon size={28} className={c.text} />
      </div>
      <h2 className="text-xl font-semibold text-white mb-2">{title}</h2>
      <p className="text-sm text-white/40 max-w-md leading-relaxed mb-6">{description}</p>

      {features.length > 0 && (
        <ul className="space-y-2 text-left mb-8">
          {features.map((f) => (
            <li key={f} className="flex items-center gap-2 text-sm text-white/40">
              <span className={clsx('w-1.5 h-1.5 rounded-full', c.bg.replace('/10', '/60'))} />
              {f}
            </li>
          ))}
        </ul>
      )}

      <div className={clsx(
        'inline-flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium',
        c.bg, c.text, c.border
      )}>
        <span>Próximamente</span>
      </div>
    </div>
  )
}
