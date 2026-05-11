import clsx from 'clsx'

const variants = {
  success: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  warning: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  danger:  'bg-red-500/10 text-red-400 border-red-500/20',
  info:    'bg-brand-500/10 text-brand-400 border-brand-500/20',
  neutral: 'bg-white/5 text-white/50 border-white/10',
}

export default function Badge({ children, variant = 'neutral', className }) {
  return (
    <span className={clsx(
      'inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium border',
      variants[variant],
      className
    )}>
      {children}
    </span>
  )
}
