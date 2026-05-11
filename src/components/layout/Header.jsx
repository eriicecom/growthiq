import { Bell, Search, PanelLeftClose, PanelLeftOpen, RefreshCw } from 'lucide-react'
import { useLocation } from 'react-router-dom'

const pageTitles = {
  '/dashboard': { title: 'Dashboard', subtitle: 'Resumen general de tu negocio' },
  '/sales': { title: 'Ventas', subtitle: 'Análisis de ingresos y tendencias' },
  '/products': { title: 'Productos', subtitle: 'Rendimiento por producto' },
  '/meta-ads': { title: 'Meta Ads', subtitle: 'Facebook e Instagram Ads' },
  '/tiktok-ads': { title: 'TikTok Ads', subtitle: 'Campañas de TikTok' },
  '/customers': { title: 'Clientes', subtitle: 'Base de clientes y segmentos' },
  '/orders': { title: 'Pedidos', subtitle: 'Gestión de pedidos' },
  '/settings': { title: 'Ajustes', subtitle: 'Configuración de la cuenta' },
}

export default function Header({ collapsed, onToggle }) {
  const { pathname } = useLocation()
  const page = pageTitles[pathname] ?? { title: 'GrowthIQ', subtitle: '' }

  return (
    <header className="h-16 bg-surface-800 border-b border-white/5 flex items-center px-6 gap-4 shrink-0">
      <button
        onClick={onToggle}
        className="text-white/40 hover:text-white transition-colors -ml-1"
        aria-label="Toggle sidebar"
      >
        {collapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
      </button>

      <div className="flex-1">
        <h1 className="text-[15px] font-semibold text-white leading-tight">{page.title}</h1>
        {page.subtitle && (
          <p className="text-[11px] text-white/40 leading-tight">{page.subtitle}</p>
        )}
      </div>

      {/* Search */}
      <div className="hidden md:flex items-center gap-2 bg-surface-700 border border-white/5 rounded-lg px-3 py-2 text-sm text-white/40 w-56 cursor-text hover:border-white/10 transition-colors">
        <Search size={14} />
        <span className="text-xs">Buscar...</span>
        <span className="ml-auto text-[10px] bg-white/5 px-1.5 py-0.5 rounded">⌘K</span>
      </div>

      {/* Refresh */}
      <button className="text-white/40 hover:text-white transition-colors p-2 rounded-lg hover:bg-white/5">
        <RefreshCw size={16} />
      </button>

      {/* Notifications */}
      <button className="relative text-white/40 hover:text-white transition-colors p-2 rounded-lg hover:bg-white/5">
        <Bell size={16} />
        <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-brand-500 rounded-full" />
      </button>

      {/* Date range pill */}
      <div className="hidden sm:flex items-center gap-1.5 bg-surface-700 border border-white/5 rounded-lg px-3 py-1.5 text-xs text-white/60">
        <span>Últimos 30 días</span>
      </div>
    </header>
  )
}
